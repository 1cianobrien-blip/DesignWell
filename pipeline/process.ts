// Process pending candidates: triage → draft → company resolution → validate → quality gate.
import { sql } from "@/lib/db";
import { FetchBlocked, urlResolves } from "@/lib/http";
import { SpendCapReached } from "@/lib/llm";
import { getSettings, type Settings } from "@/lib/settings";
import { canonicalUrl, hostOf, isNoScrape, rootDomain, slugify } from "@/lib/url";
import { draftFromUrl, type Draft } from "./draft";
import { PageUnavailable } from "./page";
import { resolveCompany } from "./resolve";
import { bump, recordError, type Run } from "./run";
import { triageBatch } from "./triage";

type Candidate = {
  id: string;
  url: string;
  canonical_url: string;
  title: string | null;
  snippet: string | null;
  source_id: string | null;
  submission_id: string | null;
  stage: string;
  triage: unknown;
  source_name: string | null;
};

type Outcome = "published" | "review" | "rejected" | "discarded" | "duplicate" | "error" | "blocked" | "skipped";

async function setCandidate(id: string, fields: { stage?: string; outcome?: Outcome; reason?: string | null; triage?: unknown; draft?: unknown; quality_score?: number | null; entry_id?: string | null; run_id?: string }) {
  await sql`update candidates set
      stage = coalesce(${fields.stage ?? null}::candidate_stage, stage),
      outcome = coalesce(${fields.outcome ?? null}::candidate_outcome, outcome),
      reason = coalesce(${fields.reason ?? null}, reason),
      triage = coalesce(${fields.triage === undefined ? null : sql.json(fields.triage as never)}, triage),
      draft = coalesce(${fields.draft === undefined ? null : sql.json(fields.draft as never)}, draft),
      quality_score = coalesce(${fields.quality_score ?? null}, quality_score),
      entry_id = coalesce(${fields.entry_id ?? null}, entry_id),
      run_id = coalesce(${fields.run_id ?? null}, run_id),
      updated_at = now()
    where id = ${id}`;
}

/** Source scoring counters: triage discards and gate rejections both count as rejected. */
async function scoreSource(sourceId: string | null, outcome: Outcome) {
  if (!sourceId) return;
  if (outcome === "published") await sql`update sources set published_count = published_count + 1 where id = ${sourceId}`;
  else if (outcome === "rejected" || outcome === "discarded") await sql`update sources set rejected_count = rejected_count + 1 where id = ${sourceId}`;
}

async function setSubmission(submissionId: string | null, status: string, reason: string | null, entryId: string | null = null) {
  if (!submissionId) return;
  await sql`update submissions set status = ${status}::submission_status, reason = ${reason}, entry_id = coalesce(${entryId}, entry_id) where id = ${submissionId}`;
}

async function isBlockedDomain(url: string): Promise<boolean> {
  const host = hostOf(url);
  const root = rootDomain(url);
  const [hit] = await sql`select 1 from blocked_domains where domain in (${host}, ${root})`;
  return !!hit;
}

async function uniqueEntrySlug(title: string, company: string): Promise<string> {
  const base = slugify(`${company} ${title}`, 70) || "entry";
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await sql`select 1 from entries where slug = ${s}`;
    if (!hit) return s;
  }
  return `${base}-${Date.now()}`;
}

function titleKey(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3).sort().join(" ");
}

/** Same company, near-identical title within 60 days → duplicate (e.g. a news write-up of a company's own post). */
async function isNearDuplicate(companyId: string, title: string): Promise<string | null> {
  const rows = await sql<{ id: string; title: string }[]>`
    select id, title from entries where company_id = ${companyId} and status in ('published','review') and created_at > now() - interval '60 days'`;
  const k = new Set(titleKey(title).split(" "));
  for (const r of rows) {
    const o = titleKey(r.title).split(" ");
    const overlap = o.filter((w) => k.has(w)).length / Math.max(1, Math.min(o.length, k.size));
    if (overlap >= 0.8) return r.id;
  }
  return null;
}

function decide(score: number, s: Settings): "published" | "review" | "rejected" {
  if (score >= s.publish_threshold) return "published";
  if (score >= s.review_threshold) return "review";
  return "rejected";
}

async function processOne(c: Candidate, run: Run, settings: Settings): Promise<Outcome> {
  const origin = c.submission_id ? "submission" : "pipeline";
  if (await isBlockedDomain(c.url)) {
    await setCandidate(c.id, { stage: "done", outcome: "blocked", reason: "blocked domain" });
    await setSubmission(c.submission_id, "rejected", "blocked domain");
    return "blocked";
  }
  if (isNoScrape(c.url)) {
    // LinkedIn / X etc. are never fetched. Submissions of these go to the review queue for the owner.
    if (c.submission_id) {
      await setCandidate(c.id, { stage: "gate", outcome: "review", reason: "no-scrape platform: needs manual review" });
      await setSubmission(c.submission_id, "review", "Needs manual review (platform can't be fetched)");
      return "review";
    }
    await setCandidate(c.id, { stage: "done", outcome: "skipped", reason: "no-scrape platform" });
    return "skipped";
  }

  // ---- Draft
  await setCandidate(c.id, { stage: "draft", run_id: run.id });
  let draft: Draft | null;
  try {
    draft = await draftFromUrl(c.url, { runId: run.id, hints: { title: c.title ?? undefined, snippet: c.snippet ?? undefined } });
  } catch (e) {
    if (e instanceof SpendCapReached) throw e;
    const reason = e instanceof FetchBlocked ? `blocked: ${e.message}` : e instanceof PageUnavailable ? `unavailable: ${e.message}` : `draft error: ${(e as Error).message}`;
    const outcome: Outcome = e instanceof FetchBlocked ? "skipped" : "error";
    await sql`update candidates set attempts = attempts + 1 where id = ${c.id}`;
    await setCandidate(c.id, { stage: "draft", outcome, reason });
    await setSubmission(c.submission_id, "error", reason);
    return outcome;
  }
  if (!draft) {
    await setCandidate(c.id, { stage: "draft", outcome: "error", reason: "drafting returned no result" });
    await setSubmission(c.submission_id, "error", "drafting failed");
    return "error";
  }
  const { page_links: _l, page_feeds: _f, ...storedDraft } = draft;
  await setCandidate(c.id, { draft: storedDraft, quality_score: draft.quality_score });

  // Draft URL may differ after redirects/canonical; dedupe again.
  const [dupe] = await sql<{ id: string }[]>`select id from entries where source_url = ${draft.canonical_url} or source_url = ${c.canonical_url}`;
  if (dupe) {
    await setCandidate(c.id, { stage: "done", outcome: "duplicate", reason: "entry already exists", entry_id: dupe.id });
    await setSubmission(c.submission_id, "rejected", "Already on DesignWell", dupe.id);
    return "duplicate";
  }

  // Early reject: clearly not company work → don't spend on company resolution.
  let decision = decide(draft.quality_score, settings);
  if (decision === "rejected") {
    const reason = `score ${draft.quality_score} < ${settings.review_threshold}: ${draft.not_company_work_reason ?? draft.quality_reasons.caps.join("; ") ?? ""}`.trim();
    await setCandidate(c.id, { stage: "gate", outcome: "rejected", reason: reason.slice(0, 500) });
    await setSubmission(c.submission_id, "rejected", reason.slice(0, 300));
    return "rejected";
  }

  // ---- Company resolution
  await setCandidate(c.id, { stage: "resolve" });
  const company = await resolveCompany(draft, run.id);
  if (company.blocked) {
    await setCandidate(c.id, { stage: "done", outcome: "blocked", reason: `company blocked: ${company.name}` });
    await setSubmission(c.submission_id, "rejected", "company blocked");
    return "blocked";
  }

  // ---- Validate
  await setCandidate(c.id, { stage: "validate" });
  if (!(await urlResolves(draft.source_url, "page"))) {
    await setCandidate(c.id, { stage: "validate", outcome: "rejected", reason: "source URL does not resolve" });
    await setSubmission(c.submission_id, "rejected", "source URL does not resolve");
    return "rejected";
  }
  let thumb = draft.thumbnail_url;
  if (thumb && !(await urlResolves(thumb, "image"))) thumb = null;
  const near = await isNearDuplicate(company.id, draft.title);
  if (near) {
    await setCandidate(c.id, { stage: "done", outcome: "duplicate", reason: "near-duplicate of existing entry", entry_id: near });
    await setSubmission(c.submission_id, "rejected", "Already on DesignWell", near);
    return "duplicate";
  }
  // No thumbnail: publishable entries without an image drop to review so the feed stays visual.
  if (!thumb && decision === "published") decision = "review";
  // Submissions never auto-publish from an unknown submitter below the bar; same thresholds apply.

  // ---- Gate → entry
  const slug = await uniqueEntrySlug(draft.title, company.name);
  const expires = decision === "review" ? new Date(Date.now() + settings.review_expiry_days * 86400_000) : null;
  const [entry] = await sql<{ id: string }[]>`
    insert into entries (slug, title, company_id, type, source_url, source_platform, source_id, published_at, thumbnail_url,
                         summary, tags, quality_score, quality_reasons, status, origin, review_expires_at)
    values (${slug}, ${draft.title}, ${company.id}, ${draft.type}, ${draft.canonical_url}, ${draft.source_platform}, ${c.source_id},
            ${draft.published_at}, ${thumb}, ${draft.summary}, ${draft.tags}, ${draft.quality_score}, ${sql.json(draft.quality_reasons as never)},
            ${decision}, ${origin}, ${expires})
    on conflict (source_url) do nothing
    returning id`;
  if (!entry) {
    await setCandidate(c.id, { stage: "done", outcome: "duplicate", reason: "entry already exists (race)" });
    return "duplicate";
  }
  await setCandidate(c.id, { stage: "done", outcome: decision, reason: `score ${draft.quality_score}`, entry_id: entry.id });
  await setSubmission(c.submission_id, decision, `score ${draft.quality_score}`, entry.id);
  return decision;
}

/** Triage collected candidates in batches with the cheap model. Submissions skip triage. */
export async function triagePending(run: Run, limit = 200) {
  const rows = await sql<Candidate[]>`
    select c.id, c.url, c.canonical_url, c.title, c.snippet, c.source_id, c.submission_id, c.stage, c.triage, s.name as source_name
    from candidates c left join sources s on s.id = c.source_id
    where c.outcome = 'pending' and c.stage = 'collected' and c.submission_id is null
    order by c.created_at asc limit ${limit}`;
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const verdicts = await triageBatch(
      batch.map((r, idx) => ({ id: idx, title: r.title ?? r.url, url: r.url, snippet: r.snippet, source: r.source_name })),
      run.id,
    );
    for (const [idx, r] of batch.entries()) {
      const v = verdicts.get(idx);
      if (!v) continue; // retry next run
      if (v.keep) {
        await setCandidate(r.id, { stage: "triage", triage: v, reason: v.reason });
        bump(run, "triage_kept");
      } else {
        await setCandidate(r.id, { stage: "triage", outcome: "discarded", triage: v, reason: v.reason });
        await scoreSource(r.source_id, "discarded");
        bump(run, "triage_discarded");
      }
    }
  }
}

/** Draft, resolve, validate and gate triaged candidates (plus submissions). */
export async function processTriaged(run: Run, limit = 40) {
  const settings = await getSettings();
  const rows = await sql<Candidate[]>`
    select c.id, c.url, c.canonical_url, c.title, c.snippet, c.source_id, c.submission_id, c.stage, c.triage, s.name as source_name
    from candidates c left join sources s on s.id = c.source_id
    where (c.outcome = 'pending' and (c.stage = 'triage' or (c.submission_id is not null and c.stage = 'collected')))
       or (c.outcome = 'error' and c.attempts < 3 and c.updated_at < now() - interval '6 hours')
    order by (c.submission_id is not null) desc, coalesce((c.triage->>'priority')::int, 5) desc, c.created_at desc
    limit ${limit}`;
  for (const c of rows) {
    run.itemsIn++;
    try {
      const outcome = await processOne(c, run, settings);
      bump(run, `outcome_${outcome}`);
      if (outcome === "published") run.published++;
      await scoreSource(c.source_id, outcome);
    } catch (e) {
      if (e instanceof SpendCapReached) throw e;
      recordError(run, e, c.url);
      await sql`update candidates set attempts = attempts + 1, outcome = 'error', reason = ${String((e as Error).message).slice(0, 300)}, updated_at = now() where id = ${c.id}`;
    }
  }
}

/** How many drafts are left this week (Monday 00:00 UTC onwards) under the weekly limit. */
export async function draftsLeftThisWeek(): Promise<number> {
  const { weekly_draft_limit } = await getSettings();
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from llm_calls
    where purpose = 'draft' and run_id is not null and created_at >=(date_trunc('week', now() at time zone 'utc') at time zone 'utc')`;
  return Math.max(0, weekly_draft_limit - n);
}

/** Kept items that were never chosen for drafting within 3 weeks are closed out (logged for the experiment). */
export async function expireUnchosen(run: Run) {
  const rows = await sql`
    update candidates set outcome = 'skipped', stage = 'done', reason = 'not drafted: ranked below the weekly limit', updated_at = now()
    where outcome = 'pending' and stage = 'triage' and created_at < now() - interval '21 days'
    returning id`;
  bump(run, "unchosen_expired", rows.length);
}

/** Insert a URL as a candidate (dedupe on canonical URL). Returns true if new. */
export async function addCandidate(input: { url: string; title?: string | null; snippet?: string | null; sourceId?: string | null; submissionId?: string | null }): Promise<boolean> {
  const canonical = canonicalUrl(input.url);
  const [existing] = await sql`select 1 from entries where source_url = ${canonical}`;
  if (existing) return false;
  const rows = await sql`
    insert into candidates (url, canonical_url, title, snippet, source_id, submission_id)
    values (${input.url}, ${canonical}, ${input.title ?? null}, ${input.snippet?.slice(0, 1000) ?? null}, ${input.sourceId ?? null}, ${input.submissionId ?? null})
    on conflict (canonical_url) do nothing returning id`;
  if (rows.length && input.sourceId) await sql`update sources set candidates_count = candidates_count + 1 where id = ${input.sourceId}`;
  return rows.length > 0;
}
