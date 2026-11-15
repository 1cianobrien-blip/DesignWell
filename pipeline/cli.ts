// DesignWell pipeline CLI.
//   npm run pipeline -- daily          free sources + cheap triage + jobs sync + housekeeping (scheduled daily)
//   npm run pipeline -- weekly         web searches + draft the top-ranked items up to the weekly limit + snowball (scheduled weekly)
//   npm run pipeline -- collect | triage | process | maintenance
//   npm run pipeline -- seed           first-run source setup (verifies feeds)
//   npm run pipeline -- jobs           daily ATS sync
//   npm run pipeline -- snowball       find company design channels
//   npm run pipeline -- draft <url>    draft + score a single URL (no DB writes besides cost logging)
//   npm run pipeline -- eval [file] [--discover]   score the labelled URL set and report
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { sql } from "@/lib/db";
import { SpendCapReached, spentToday, webSearch } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { collectDue } from "./collect";
import { draftFromUrl } from "./draft";
import { syncJobs } from "./jobs";
import { expireReviews, scoreSources } from "./maintenance";
import { draftsLeftThisWeek, expireUnchosen, processTriaged, triagePending } from "./process";
import { finishRun, recordError, startRun, type Run } from "./run";
import { seedSources } from "./seed";
import { snowball } from "./snowball";

async function guarded(jobType: string, fn: (run: Run) => Promise<void>) {
  const settings = await getSettings();
  if (!settings.pipeline_enabled && jobType !== "maintenance") {
    console.log("pipeline disabled in settings; skipping", jobType);
    return;
  }
  const run = await startRun(jobType);
  try {
    await fn(run);
  } catch (e) {
    if (e instanceof SpendCapReached) {
      run.stoppedReason = "spend_cap";
      console.log(e.message);
    } else {
      recordError(run, e, "fatal");
      process.exitCode = 1;
    }
  } finally {
    await finishRun(run);
  }
}

async function evalSet(file: string, discover: boolean) {
  const spec = JSON.parse(readFileSync(file, "utf8")) as { urls: { url: string; expect: string; why: string }[] };
  const items = [...spec.urls];
  if (discover) {
    for (const q of ["new brand identity", "how we redesigned", "design system case study"]) {
      const hits = await webSearch({ query: q, purpose: "eval", maxUses: 1 });
      for (const h of hits.slice(0, 4)) items.push({ url: h.url, expect: "?", why: `discovered: ${q}` });
    }
  }
  const s = await getSettings();
  const results: unknown[] = [];
  let agree = 0;
  let judged = 0;
  for (const it of items) {
    process.stdout.write(`… ${it.url}\n`);
    try {
      const d = await draftFromUrl(it.url);
      if (!d) throw new Error("no draft");
      const got = d.quality_score >= s.publish_threshold ? "publish" : d.quality_score >= s.review_threshold ? "review" : "reject";
      const ok = it.expect === "?" ? null : got === it.expect;
      if (ok !== null) {
        judged++;
        if (ok) agree++;
      }
      console.log(
        `  ${ok === null ? "·" : ok ? "✓" : "✗"} ${String(d.quality_score).padStart(3)} ${got.padEnd(7)} (expect ${it.expect}) [${d.type}] ${d.company.name} — ${d.title}\n` +
          `      ${d.summary}\n      rubric ${Object.entries(d.rubric).map(([k, v]) => `${k}=${v.rating}`).join(" ")} recency=${d.quality_reasons.recency.rating} caps=${d.quality_reasons.caps.join("; ") || "-"} via=${d.quality_reasons.fetched_via} $${d.cost.toFixed(4)}`,
      );
      results.push({ ...it, got, score: d.quality_score, draft: { ...d, page_links: undefined } });
    } catch (e) {
      const blockedOk = it.expect === "reject";
      if (it.expect !== "?") {
        judged++;
        if (blockedOk) agree++;
      }
      console.log(`  ${blockedOk ? "✓" : "✗"} ERR ${(e as Error).constructor.name}: ${(e as Error).message}`);
      results.push({ ...it, got: "error", error: (e as Error).message });
    }
  }
  mkdirSync("pipeline/eval/results", { recursive: true });
  const out = `pipeline/eval/results/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ thresholds: s, agree, judged, results }, null, 2));
  console.log(`\nagreement ${agree}/${judged}; spent today $${(await spentToday()).toFixed(3)}; results → ${out}`);
}

const [cmd, ...args] = process.argv.slice(2);
const NEEDS_LLM = ["daily", "weekly", "run", "triage", "process", "snowball", "draft", "eval"];
if (NEEDS_LLM.includes(cmd) && !process.env.ANTHROPIC_API_KEY && !process.env.DW_ANTHROPIC_API_KEY) {
  console.error(`'${cmd}' needs ANTHROPIC_API_KEY (or DW_ANTHROPIC_API_KEY) to be set.`);
  process.exit(1);
}
try {
  switch (cmd) {
    case "daily":
      // Cheap work every day: read free sources (feeds, HN), triage with the cheap model, sync jobs, housekeeping.
      await guarded("daily", async (run) => {
        const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sources`;
        if (n === 0) await seedSources(run); // first run: the pipeline sets up its own sources
        await collectDue(run, { types: ["rss", "api", "company_channel"] });
        await triagePending(run);
        await syncJobs(run);
        await scoreSources(run);
        await expireReviews(run);
        await expireUnchosen(run);
      });
      break;
    case "weekly":
    case "run":
      // The paid work, once a week: web searches, then draft the highest-ranked items up to the weekly limit.
      await guarded("pipeline", async (run) => {
        const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sources`;
        if (n === 0) await seedSources(run);
        await collectDue(run);
        await triagePending(run);
        const left = await draftsLeftThisWeek();
        run.stats.weekly_drafts_available = left;
        if (left > 0) await processTriaged(run, left);
        await snowball(run, 8);
        await scoreSources(run);
        await expireReviews(run);
      });
      break;
    case "collect":
      await guarded("collect", (run) => collectDue(run));
      break;
    case "triage":
      await guarded("triage", (run) => triagePending(run));
      break;
    case "process":
      await guarded("process", (run) => processTriaged(run, Number(args[0] ?? 40)));
      break;
    case "maintenance":
      await guarded("maintenance", async (run) => {
        await scoreSources(run);
        await expireReviews(run);
      });
      break;
    case "seed":
      await guarded("seed", (run) => seedSources(run));
      break;
    case "jobs":
      await guarded("jobs_sync", (run) => syncJobs(run));
      break;
    case "snowball":
      await guarded("snowball", (run) => snowball(run, Number(args[0] ?? 10)));
      break;
    case "draft": {
      const d = await draftFromUrl(args[0]);
      console.log(JSON.stringify({ ...d, page_links: undefined }, null, 2));
      break;
    }
    case "eval":
      await evalSet(args.find((a) => !a.startsWith("--")) ?? "pipeline/eval/urls.json", args.includes("--discover"));
      break;
    default:
      console.log("usage: pipeline <daily|weekly|collect|triage|process|maintenance|seed|jobs|snowball|draft <url>|eval [file] [--discover]>");
  }
} finally {
  await sql.end({ timeout: 5 });
}
