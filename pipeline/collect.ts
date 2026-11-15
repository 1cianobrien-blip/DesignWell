// Collect new items from active sources and insert them as candidates.
import { XMLParser } from "fast-xml-parser";
import { sql } from "@/lib/db";
import { politeFetch, USER_AGENT } from "@/lib/http";
import { SpendCapReached, webSearch } from "@/lib/llm";
import { isNoScrape } from "@/lib/url";
import { addCandidate } from "./process";
import { bump, recordError, type Run } from "./run";

export type Source = {
  id: string;
  type: "rss" | "search_query" | "api" | "company_channel";
  name: string | null;
  url_or_query: string;
  status: string;
  last_checked_at: Date | null;
};

export type Item = { url: string; title: string; snippet?: string; publishedAt?: string | null };

const MAX_AGE_DAYS = Number(process.env.COLLECT_MAX_AGE_DAYS ?? 45);
// How often each source type is checked.
// Feeds and HN are free to read, so they're checked on every daily run; paid web searches run weekly.
const INTERVAL_HOURS: Record<Source["type"], number> = { rss: 20, api: 20, company_channel: 20, search_query: 160 };

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true });

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text((v as Record<string, unknown>)["#text"] ?? "");
  return "";
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function parseFeed(body: string): Item[] {
  const doc = xml.parse(body);
  const out: Item[] = [];
  const rssItems = doc?.rss?.channel?.item ?? doc?.["rdf:RDF"]?.item;
  if (rssItems) {
    for (const it of [].concat(rssItems)) {
      const i = it as Record<string, unknown>;
      const link = text(i.link) || text((i.guid as Record<string, unknown>)?.["#text"] ?? i.guid);
      if (!link.startsWith("http")) continue;
      out.push({
        url: link.trim(),
        title: stripHtml(text(i.title)),
        snippet: stripHtml(text(i.description) || text(i["content:encoded"])).slice(0, 600),
        publishedAt: text(i.pubDate) || text(i["dc:date"]) || null,
      });
    }
    return out;
  }
  const entries = doc?.feed?.entry;
  if (entries) {
    for (const it of [].concat(entries)) {
      const e = it as Record<string, unknown>;
      const links = [].concat((e.link as never) ?? []) as Record<string, string>[];
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const href = alt?.["@_href"];
      if (!href?.startsWith("http")) continue;
      out.push({
        url: href,
        title: stripHtml(text(e.title)),
        snippet: stripHtml(text(e.summary) || text(e.content)).slice(0, 600),
        publishedAt: text(e.published) || text(e.updated) || null,
      });
    }
  }
  return out;
}

async function collectFeed(src: Source): Promise<Item[]> {
  const res = await politeFetch(src.url_or_query, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" });
  if (res.status >= 400) throw new Error(`feed HTTP ${res.status}`);
  return parseFeed(res.body);
}

/** api sources: "hn:<query>" uses the Hacker News Algolia API. */
async function collectApi(src: Source): Promise<Item[]> {
  const [kind, ...rest] = src.url_or_query.split(":");
  const q = rest.join(":");
  if (kind === "hn") {
    const since = Math.floor(Date.now() / 1000) - 14 * 86400;
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&restrictSearchableAttributes=title&typoTolerance=false&advancedSyntax=true&numericFilters=created_at_i>${since},points>10&hitsPerPage=50`;
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
    const d = (await res.json()) as { hits: { url?: string; title: string; created_at: string; points: number }[] };
    return d.hits.filter((h) => h.url).map((h) => ({ url: h.url!, title: h.title, snippet: `Hacker News, ${h.points} points`, publishedAt: h.created_at }));
  }
  throw new Error(`unknown api source kind: ${kind}`);
}

async function collectSearch(src: Source, run: Run): Promise<Item[]> {
  const hits = await webSearch({
    query: src.url_or_query,
    purpose: "search",
    runId: run.id,
    maxUses: 2,
    instructions:
      "Search for recent (last 30 days) articles that show design work done at a specific company: case studies, rebrands, redesigns, design system write-ups, launches with design notes. Prefer primary sources (the company's own blog) and design publications.",
    blockedDomains: ["linkedin.com", "x.com", "twitter.com", "pinterest.com", "instagram.com", "facebook.com"],
  });
  return hits.map((h) => ({ url: h.url, title: h.title, snippet: h.pageAge ? `page age: ${h.pageAge}` : undefined, publishedAt: null }));
}

function tooOld(publishedAt: string | null | undefined) {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  return !Number.isNaN(t) && Date.now() - t > MAX_AGE_DAYS * 86400_000;
}

export async function collectSource(src: Source, run: Run): Promise<number> {
  let items: Item[] = [];
  try {
    items =
      src.type === "rss" || src.type === "company_channel"
        ? await collectFeed(src)
        : src.type === "api"
          ? await collectApi(src)
          : await collectSearch(src, run);
    await sql`update sources set last_checked_at = now(), last_error = null where id = ${src.id}`;
  } catch (e) {
    if (e instanceof SpendCapReached) throw e;
    await sql`update sources set last_checked_at = now(), last_error = ${String((e as Error).message).slice(0, 300)} where id = ${src.id}`;
    recordError(run, e, `collect ${src.url_or_query}`);
    return 0;
  }
  let added = 0;
  for (const it of items.slice(0, 60)) {
    if (tooOld(it.publishedAt) || isNoScrape(it.url)) continue;
    if (await addCandidate({ url: it.url, title: it.title, snippet: it.snippet, sourceId: src.id })) added++;
  }
  bump(run, "collected", added);
  return added;
}

export async function collectDue(run: Run, opts: { types?: Source["type"][]; limit?: number } = {}) {
  const sources = await sql<Source[]>`select id, type, name, url_or_query, status, last_checked_at from sources where status = 'active' order by last_checked_at asc nulls first`;
  const due = sources.filter((s) => {
    if (opts.types && !opts.types.includes(s.type)) return false;
    if (!s.last_checked_at) return true;
    return Date.now() - s.last_checked_at.getTime() >= INTERVAL_HOURS[s.type] * 3600_000 - 10 * 60_000;
  });
  for (const s of due.slice(0, opts.limit ?? 200)) {
    const n = await collectSource(s, run);
    console.log(`  collected ${n} new from ${s.name ?? s.url_or_query}`);
  }
}
