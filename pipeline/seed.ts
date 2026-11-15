// First-run source setup. Every feed is verified (fetched and parsed with at least one item) before it's added.
import { sql } from "@/lib/db";
import { politeFetch, USER_AGENT } from "@/lib/http";
import { parseFeed } from "./collect";
import { bump, recordError, type Run } from "./run";

type SeedFeed = { name: string; urls: string[] }; // first URL that verifies wins

const FEEDS: SeedFeed[] = [
  // Brand and identity news
  { name: "Brand New (UnderConsideration)", urls: ["https://www.underconsideration.com/brandnew/feed/", "https://feeds.feedburner.com/brandnew"] },
  { name: "The Brand Identity", urls: ["https://the-brandidentity.com/feed", "https://the-brandidentity.com/rss"] },
  { name: "BP&O", urls: ["https://bpando.org/feed/"] },
  { name: "Identity Designed", urls: ["https://identitydesigned.com/feed/"] },
  // Design industry publications
  { name: "It's Nice That", urls: ["https://www.itsnicethat.com/rss", "https://www.itsnicethat.com/feed", "https://www.itsnicethat.com/rss/articles"] },
  { name: "Creative Review", urls: ["https://www.creativereview.co.uk/feed/"] },
  { name: "Design Week", urls: ["https://www.designweek.co.uk/feed/"] },
  { name: "Fast Company Co.Design", urls: ["https://www.fastcompany.com/co-design/rss", "https://www.fastcompany.com/section/co-design/rss"] },
  { name: "Dezeen Graphics", urls: ["https://www.dezeen.com/design/graphics/feed/", "https://www.dezeen.com/design/feed/"] },
  { name: "Abduzeedo", urls: ["https://abduzeedo.com/rss.xml", "https://abduzeedo.com/feed"] },
  // Curated link newsletters
  { name: "Sidebar", urls: ["https://sidebar.io/feed.xml", "https://sidebar.io/feed"] },
  // Medium topic feeds
  { name: "Medium: product design", urls: ["https://medium.com/feed/tag/product-design"] },
  { name: "Medium: design systems", urls: ["https://medium.com/feed/tag/design-systems"] },
  { name: "Medium: UX design", urls: ["https://medium.com/feed/tag/ux-design"] },
  { name: "Medium: branding", urls: ["https://medium.com/feed/tag/branding"] },
  { name: "Medium: UX case study", urls: ["https://medium.com/feed/tag/ux-case-study"] },
  { name: "UX Collective", urls: ["https://uxdesign.cc/feed"] },
  // Substack topic pages have no feeds; Substack publications are added by snowball expansion.
  // Launches
  { name: "Product Hunt", urls: ["https://www.producthunt.com/feed"] },
];

// Podcasts are discovered through the public Apple Podcasts search API, which returns each show's feed URL.
const PODCASTS = ["Dive Club", "Design Details", "Design Better", "Design Matters with Debbie Millman", "The Design of Business"];

const API_SOURCES = ["hn:redesign", "hn:rebrand", "hn:design system", "hn:new brand identity", "hn:how we designed", "hn:design case study"].map((q) => ({
  name: `Hacker News: ${q.slice(3)}`,
  q,
}));

const SEARCH_QUERIES = [
  "rebrand new brand identity",
  "new brand identity unveiled",
  "how we redesigned our app",
  "design system case study company blog",
  "product design case study",
  "behind the design of",
];

async function verifyFeed(url: string): Promise<number> {
  const res = await politeFetch(url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  return parseFeed(res.body).length;
}

async function insertSource(type: string, name: string, urlOrQuery: string, companyId: string | null = null) {
  const rows = await sql`insert into sources (type, name, url_or_query, company_id) values (${type}::source_type, ${name}, ${urlOrQuery}, ${companyId})
                         on conflict (type, url_or_query) do nothing returning id`;
  return rows.length > 0;
}

async function podcastFeed(term: string): Promise<string | null> {
  const res = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=3&term=${encodeURIComponent(term)}`, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { results: { collectionName: string; feedUrl?: string }[] };
  const want = term.toLowerCase().split(" ")[0];
  return d.results.find((r) => r.feedUrl && r.collectionName.toLowerCase().includes(want))?.feedUrl ?? null;
}

export async function seedSources(run: Run) {
  for (const f of FEEDS) {
    let ok = false;
    for (const url of f.urls) {
      try {
        const n = await verifyFeed(url);
        if (n > 0) {
          if (await insertSource("rss", f.name, url)) bump(run, "seeded_rss");
          console.log(`  ✓ ${f.name} (${n} items) ${url}`);
          ok = true;
          break;
        }
      } catch (e) {
        console.log(`  ✗ ${f.name} ${url}: ${(e as Error).message}`);
      }
    }
    if (!ok) {
      bump(run, "seed_failed");
      recordError(run, new Error("no working feed URL"), f.name);
    }
  }
  for (const p of PODCASTS) {
    try {
      const feed = await podcastFeed(p);
      if (feed && (await verifyFeed(feed)) > 0) {
        if (await insertSource("rss", `Podcast: ${p}`, feed)) bump(run, "seeded_podcast");
        console.log(`  ✓ podcast ${p} ${feed}`);
      } else console.log(`  ✗ podcast ${p}: not found`);
    } catch (e) {
      console.log(`  ✗ podcast ${p}: ${(e as Error).message}`);
    }
  }
  for (const a of API_SOURCES) if (await insertSource("api", a.name, a.q)) bump(run, "seeded_api");
  for (const q of SEARCH_QUERIES) if (await insertSource("search_query", `Search: ${q}`, q)) bump(run, "seeded_search");
}
