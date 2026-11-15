// Snowball expansion: once a company has published work, find its own design channels
// (design blog, Medium publication, Substack, podcast, design team page) and monitor them.
import { z } from "zod";
import { sql } from "@/lib/db";
import { extractPage } from "@/lib/html";
import { politeFetch } from "@/lib/http";
import { MODELS, SpendCapReached, structured, webSearch } from "@/lib/llm";
import { hostOf, isNoScrape, rootDomain } from "@/lib/url";
import { parseFeed } from "./collect";
import { bump, recordError, type Run } from "./run";

type FeedCandidate = { feedUrl: string; pageUrl: string; pageTitle: string; sampleTitles: string[] };

/** Find the feed for a page: Medium/Substack conventions first, then <link rel="alternate">. */
async function feedFor(url: string): Promise<FeedCandidate | null> {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  let feedUrl: string | null = null;
  let pageTitle = "";
  if (host === "medium.com") {
    const pub = u.pathname.split("/").filter(Boolean)[0];
    if (pub) feedUrl = `https://medium.com/feed/${pub}`;
  } else if (host.endsWith(".medium.com") || host.endsWith(".substack.com")) {
    feedUrl = `https://${host}/feed`;
  } else {
    const res = await politeFetch(url, { timeoutMs: 15_000 });
    if (res.status >= 400) return null;
    const page = extractPage(res.body, res.finalUrl, 500);
    pageTitle = page.title ?? "";
    feedUrl = page.feeds[0] ?? null;
    if (!feedUrl && /substack/i.test(res.body)) feedUrl = new URL("/feed", res.finalUrl).toString();
  }
  if (!feedUrl) return null;
  const res = await politeFetch(feedUrl, { accept: "application/rss+xml, application/atom+xml, application/xml" });
  if (res.status >= 400) return null;
  const items = parseFeed(res.body);
  if (!items.length) return null;
  return { feedUrl, pageUrl: url, pageTitle, sampleTitles: items.slice(0, 8).map((i) => i.title) };
}

const Verdict = z.object({
  channels: z.array(
    z.object({
      index: z.number().int(),
      is_company_design_channel: z.boolean().describe("True only if this feed is published by the company (or its design team) and regularly covers its design work"),
      label: z.string().describe("Short label, e.g. 'Airbnb Design blog'"),
    }),
  ),
});

export async function snowballCompany(company: { id: string; name: string; website: string | null }, run: Run) {
  const queries = [`${company.name} design blog`, `${company.name} design team medium`, `${company.name} design podcast episode`];
  const urls = new Set<string>();
  for (const q of queries) {
    const hits = await webSearch({ query: q, purpose: "snowball", runId: run.id, maxUses: 1 });
    for (const h of hits.slice(0, 6)) if (!isNoScrape(h.url)) urls.add(h.url);
  }
  if (company.website) {
    for (const p of ["/design", "/blog/design", "/blog"]) urls.add(new URL(p, company.website).toString());
    urls.add(`https://${rootDomain(company.website).split(".")[0]}.design`);
  }
  const found: FeedCandidate[] = [];
  const seenFeeds = new Set<string>();
  for (const url of [...urls].slice(0, 14)) {
    try {
      const f = await feedFor(url);
      if (f && !seenFeeds.has(f.feedUrl)) {
        seenFeeds.add(f.feedUrl);
        found.push(f);
      }
    } catch {
      /* unreachable page */
    }
  }
  if (!found.length) return 0;
  const res = await structured({
    purpose: "snowball",
    model: MODELS.research,
    system:
      "You decide which feeds are a company's own design channels: its design blog, its design team's Medium or Substack, or a company-run design podcast. Third-party publications, general news, personal blogs of employees and general company blogs that rarely cover design are not.",
    user: `Company: ${company.name} (${company.website ?? "website unknown"})\n\n${found
      .map((f, i) => `<feed index="${i}">\nfeed: ${f.feedUrl}\npage: ${f.pageUrl} ${f.pageTitle}\nrecent items:\n- ${f.sampleTitles.join("\n- ")}\n</feed>`)
      .join("\n")}`,
    schema: Verdict,
    effort: "low",
    maxTokens: 4_000,
    runId: run.id,
  });
  let added = 0;
  for (const v of res.data?.channels ?? []) {
    const f = found[v.index];
    if (!f || !v.is_company_design_channel) continue;
    const rows = await sql`insert into sources (type, name, url_or_query, company_id) values ('company_channel', ${v.label}, ${f.feedUrl}, ${company.id})
                           on conflict (type, url_or_query) do nothing returning id`;
    if (rows.length) {
      added++;
      console.log(`  + ${v.label} ${f.feedUrl} (${hostOf(f.pageUrl)})`);
    }
  }
  return added;
}

export async function snowball(run: Run, limit = 10) {
  const companies = await sql<{ id: string; name: string; website: string | null }[]>`
    select c.id, c.name, c.website from companies c
    where c.research_done_at is null and not c.blocked and not c.hidden
      and exists (select 1 from entries e where e.company_id = c.id and e.status = 'published')
    order by c.created_at asc limit ${limit}`;
  for (const c of companies) {
    run.itemsIn++;
    try {
      const n = await snowballCompany(c, run);
      bump(run, "channels_added", n);
      await sql`update companies set research_done_at = now() where id = ${c.id}`;
    } catch (e) {
      if (e instanceof SpendCapReached) throw e;
      recordError(run, e, `snowball ${c.name}`);
    }
  }
}
