// Company resolution: match a draft's company to an existing row, or create one with
// website, logo, one-liner, careers page and ATS.
import { z } from "zod";
import { detectAts, verifyAts, type Ats } from "@/lib/ats";
import { sql } from "@/lib/db";
import { extractPage, type PageInfo } from "@/lib/html";
import { politeFetch, urlResolves } from "@/lib/http";
import { MODELS, structured, webSearch } from "@/lib/llm";
import { hostOf, rootDomain, slugify } from "@/lib/url";

export type Company = {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  blocked: boolean;
  hidden: boolean;
};

const AGGREGATOR_HOSTS = /(medium\.com|substack\.com|youtube\.com|vimeo\.com|linkedin\.com|x\.com|twitter\.com|wikipedia\.org|crunchbase\.com|behance\.net|dribbble\.com|github\.com|apple\.com\/app-store|apps\.apple\.com|play\.google\.com|bloomberg\.com|techcrunch\.com|underconsideration\.com|itsnicethat\.com|creativereview\.co\.uk|designweek\.co\.uk|fastcompany\.com|producthunt\.com|ycombinator\.com|glassdoor|indeed|greenhouse\.io|lever\.co|ashbyhq\.com)/i;

function normName(n: string) {
  return n
    .toLowerCase()
    .replace(/\b(inc|inc\.|llc|ltd|limited|gmbh|corp|corporation|co|company|plc|ab|sa|technologies|labs|hq)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function findExisting(name: string, domain: string | null): Promise<Company | null> {
  if (domain) {
    const [byDomain] = await sql<Company[]>`select id, slug, name, domain, blocked, hidden from companies where domain = ${domain}`;
    if (byDomain) return byDomain;
  }
  const key = normName(name);
  if (!key) return null;
  const rows = await sql<Company[]>`select id, slug, name, domain, blocked, hidden from companies`;
  return rows.find((r) => normName(r.name) === key) ?? null;
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base, 60) || "company";
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await sql`select 1 from companies where slug = ${s}`;
    if (!hit) return s;
  }
  return `${root}-${Date.now()}`;
}

async function fetchHome(url: string): Promise<PageInfo | null> {
  try {
    const res = await politeFetch(url, { timeoutMs: 15_000 });
    if (res.status >= 400) return null;
    return extractPage(res.body, res.finalUrl, 4_000);
  } catch {
    return null;
  }
}

/** Plausibility check that a domain belongs to the named company. */
function domainMatchesName(domain: string, name: string): boolean {
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const n = normName(name);
  if (!label || !n) return false;
  return label === n || label.includes(n) || n.includes(label) || label.startsWith(n.slice(0, Math.max(4, Math.floor(n.length * 0.6))));
}

async function findWebsite(name: string, hint: string | null, sourceUrl: string, runId: string | null): Promise<string | null> {
  if (hint) {
    try {
      const u = new URL(hint.startsWith("http") ? hint : `https://${hint}`);
      if (!AGGREGATOR_HOSTS.test(u.hostname)) return `https://${u.hostname}`;
    } catch {
      /* fall through */
    }
  }
  // The source is often the company's own blog (e.g. stripe.com/blog/...).
  const srcDomain = rootDomain(sourceUrl);
  if (srcDomain && !AGGREGATOR_HOSTS.test(srcDomain) && domainMatchesName(srcDomain, name)) return `https://${srcDomain}`;
  const hits = await webSearch({ query: `${name} official website`, purpose: "resolve", runId, maxUses: 1 });
  for (const h of hits) {
    const d = rootDomain(h.url);
    if (d && !AGGREGATOR_HOSTS.test(d) && domainMatchesName(d, name)) return `https://${d}`;
  }
  return null;
}

const CAREERS_LINK = /\b(careers?|jobs|join( us)?|work with us|we'?re hiring|open roles|open positions)\b/i;
const CAREERS_PATHS = ["/careers", "/jobs", "/company/careers", "/about/careers", "/join"];

async function findCareers(website: string, home: PageInfo | null, name: string, runId: string | null): Promise<{ careersUrl: string | null; ats: Ats | null }> {
  const candidates: string[] = [];
  if (home) {
    const direct = detectAts(home.links.map((l) => l.href).join(" "));
    if (direct) {
      const link = home.links.find((l) => detectAts(l.href));
      return { careersUrl: link?.href ?? null, ats: direct };
    }
    for (const l of home.links) if (CAREERS_LINK.test(l.text) || /\/(careers?|jobs)(\/|$)/i.test(l.href)) candidates.push(l.href);
  }
  for (const p of CAREERS_PATHS) candidates.push(new URL(p, website).toString());
  const tried = new Set<string>();
  for (const url of candidates) {
    if (tried.has(url) || tried.size >= 4) continue;
    tried.add(url);
    try {
      const res = await politeFetch(url, { timeoutMs: 15_000 });
      if (res.status >= 400) continue;
      const ats = detectAts(res.body) ?? detectAts(res.finalUrl);
      return { careersUrl: res.finalUrl, ats };
    } catch {
      /* next */
    }
  }
  // Last resort: search for the company's job board.
  const hits = await webSearch({ query: `${name} careers jobs`, purpose: "resolve", runId, maxUses: 1 });
  for (const h of hits) {
    const ats = detectAts(h.url);
    if (ats) {
      const v = await verifyAts(ats);
      if (v.ok && (ats.provider !== "greenhouse" || !v.name || domainMatchesName(slugify(v.name).replace(/-/g, "") + ".x", name))) {
        return { careersUrl: h.url, ats };
      }
    }
  }
  const own = hits.find((h) => rootDomain(h.url) === rootDomain(website) && /career|job/i.test(h.url));
  return { careersUrl: own?.url ?? null, ats: null };
}

const OneLiner = z.object({
  one_liner: z.string().nullable().describe("What the company does, max 90 characters, plain and factual, e.g. 'Payments infrastructure for the internet'. Null if the text doesn't say."),
});

async function writeOneLiner(name: string, home: PageInfo | null, runId: string | null): Promise<string | null> {
  if (!home?.description && !home?.title) return null;
  const res = await structured({
    purpose: "resolve",
    model: MODELS.research,
    system: "You write a short factual one-liner describing what a company does, using only the homepage text given. Never invent.",
    user: `Company: ${name}\nHomepage title: ${home.title ?? ""}\nMeta description: ${home.description ?? ""}\nText: ${home.text.slice(0, 1500)}`,
    schema: OneLiner,
    effort: "low",
    maxTokens: 2_000,
    runId,
  });
  return res.data?.one_liner?.slice(0, 120) ?? null;
}

async function pickLogo(website: string, home: PageInfo | null): Promise<string | null> {
  const options = [...(home?.icons ?? []), new URL("/apple-touch-icon.png", website).toString()];
  for (const u of options.slice(0, 4)) {
    if (/\.ico(\?|$)/i.test(u)) continue;
    if (await urlResolves(u, "image")) return u;
  }
  return `https://www.google.com/s2/favicons?domain=${hostOf(website)}&sz=128`;
}

export async function resolveCompany(
  draft: { company: { name: string; website: string | null }; source_url: string },
  runId: string | null,
): Promise<Company> {
  const name = draft.company.name.trim();
  // Try a cheap match before any network work.
  const hintDomain = draft.company.website ? rootDomain(draft.company.website) || null : null;
  const pre = await findExisting(name, hintDomain && !AGGREGATOR_HOSTS.test(hintDomain) ? hintDomain : null);
  if (pre) return pre;

  const website = await findWebsite(name, draft.company.website, draft.source_url, runId);
  const domain = website ? rootDomain(website) : null;
  if (domain) {
    const again = await findExisting(name, domain);
    if (again) return again;
  }
  const home = website ? await fetchHome(website) : null;
  const [oneLiner, careers, logo] = await Promise.all([
    writeOneLiner(name, home, runId).catch(() => null),
    website ? findCareers(website, home, name, runId).catch(() => ({ careersUrl: null, ats: null })) : Promise.resolve({ careersUrl: null, ats: null }),
    website ? pickLogo(website, home).catch(() => null) : Promise.resolve(null),
  ]);
  let ats = careers.ats;
  if (ats && !(await verifyAts(ats)).ok) ats = null;
  const brandColor = home?.themeColor && /^#[0-9a-f]{6}$/i.test(home.themeColor) ? home.themeColor : null;

  const slug = await uniqueSlug(name);
  const [row] = await sql<Company[]>`
    insert into companies (slug, name, website, domain, logo_url, brand_color, one_liner, careers_url, ats_provider, ats_board_token, created_by)
    values (${slug}, ${name}, ${website}, ${domain}, ${logo}, ${brandColor}, ${oneLiner}, ${careers.careersUrl}, ${ats?.provider ?? null}, ${ats?.token ?? null}, 'pipeline')
    on conflict (domain) do update set name = companies.name
    returning id, slug, name, domain, blocked, hidden`;
  return row;
}
