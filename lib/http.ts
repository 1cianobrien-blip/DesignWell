// Polite HTTP client for the crawler: identifies itself, honours robots.txt, rate-limits per host.
import { hostOf, isNoScrape } from "./url";

export const USER_AGENT =
  process.env.CRAWLER_USER_AGENT ??
  `DesignWellBot/1.0 (+${process.env.SITE_URL ?? "https://designwell.co"}/about#crawler)`;
const UA_TOKEN = "designwellbot";
const PER_HOST_INTERVAL_MS = Number(process.env.CRAWL_INTERVAL_MS ?? 1500);
const MAX_BYTES = 3_000_000;

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, Promise<Robots>>();

type Rule = { allow: boolean; path: string };
type Robots = { rules: Rule[]; crawlDelayMs?: number };

export class FetchBlocked extends Error {}

function parseRobots(txt: string): Robots {
  // Collect groups that apply to our token, falling back to "*".
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") {
      if (val === "" && key === "disallow") continue;
      cur.rules.push({ allow: key === "allow", path: val });
    } else if (key === "crawl-delay") {
      const n = Number(val);
      if (!Number.isNaN(n)) cur.delay = n * 1000;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && UA_TOKEN.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelayMs: chosen.map((g) => g.delay).find((d) => d !== undefined),
  };
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path);
}

async function getRobots(origin: string): Promise<Robots> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      (async () => {
        try {
          const res = await fetch(origin + "/robots.txt", {
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(10_000),
            redirect: "follow",
          });
          if (res.status >= 400) return { rules: [] }; // no robots.txt => allowed
          return parseRobots(await res.text());
        } catch {
          return { rules: [] };
        }
      })(),
    );
  }
  return robotsCache.get(origin)!;
}

export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  const robots = await getRobots(u.origin);
  const path = u.pathname + u.search;
  let best: Rule | null = null;
  for (const r of robots.rules) {
    if (matches(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function throttle(url: string) {
  const u = new URL(url);
  const robots = await getRobots(u.origin);
  const interval = Math.max(PER_HOST_INTERVAL_MS, Math.min(robots.crawlDelayMs ?? 0, 30_000));
  const host = u.hostname;
  const now = Date.now();
  const wait = (lastHit.get(host) ?? 0) + interval - now;
  lastHit.set(host, Math.max(now, (lastHit.get(host) ?? 0) + interval));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export type FetchResult = { url: string; finalUrl: string; status: number; contentType: string; body: string };

/** Fetch a public page as the DesignWell crawler. Throws FetchBlocked for robots/no-scrape hosts. */
export async function politeFetch(url: string, opts: { accept?: string; timeoutMs?: number; skipRobots?: boolean } = {}): Promise<FetchResult> {
  if (isNoScrape(url)) throw new FetchBlocked(`no-scrape host: ${hostOf(url)}`);
  if (!opts.skipRobots && !(await robotsAllows(url))) throw new FetchBlocked(`robots.txt disallows ${url}`);
  await throttle(url);
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  const finalUrl = res.url || url;
  if (finalUrl !== url && isNoScrape(finalUrl)) throw new FetchBlocked(`redirected to no-scrape host: ${hostOf(finalUrl)}`);
  const reader = res.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      chunks.push(value);
      if (received > MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
  }
  const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
  return { url, finalUrl, status: res.status, contentType: res.headers.get("content-type") ?? "", body };
}

/** Lightweight check that a URL resolves (used by validation). HEAD first, then GET. */
export async function urlResolves(url: string, expect: "page" | "image" = "page"): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (method === "GET") await res.body?.cancel();
      if (res.status >= 200 && res.status < 400) {
        if (expect === "image") {
          const ct = res.headers.get("content-type") ?? "";
          if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) continue;
        }
        return true;
      }
      // Some sites (Medium, Cloudflare) reject bots with 403 but the page exists for people.
      if (expect === "page" && (res.status === 403 || res.status === 429)) return true;
    } catch {
      /* try next method */
    }
  }
  return false;
}
