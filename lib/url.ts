// URL canonicalisation used for dedupe (candidates.canonical_url, entries.source_url).
const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|source$|s$|si$|igshid$|_hsenc$|_hsmi$|mkt_tok$|trk$|sk$)/i;

export function canonicalUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim();
  }
  u.protocol = "https:";
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  // Medium appends a hash-like id suffix to slugs and ?source=...; keep the path but drop trailing slash.
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  // YouTube: collapse youtu.be and watch?v= forms.
  if (u.hostname === "youtu.be") return `https://youtube.com/watch?v=${u.pathname.slice(1)}`;
  if (u.hostname === "youtube.com" && u.pathname === "/watch") {
    const v = u.searchParams.get("v");
    if (v) return `https://youtube.com/watch?v=${v}`;
  }
  return u.toString();
}

export function hostOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Registrable-ish domain: last two labels, or three for common 2nd-level ccTLDs. */
export function rootDomain(input: string): string {
  const host = input.includes("/") ? hostOf(input) : input.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const sld = parts.slice(-2).join(".");
  if (/^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(sld)) return parts.slice(-3).join(".");
  return sld;
}

export function slugify(s: string, max = 80): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Platforms whose content may only enter through submissions or links (no scraping). */
export const NO_SCRAPE_HOSTS = ["linkedin.com", "x.com", "twitter.com", "instagram.com", "facebook.com", "threads.net", "tiktok.com"];
export function isNoScrape(url: string): boolean {
  const h = hostOf(url);
  return NO_SCRAPE_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

export function platformOf(url: string): string {
  const h = hostOf(url);
  if (h.endsWith("medium.com")) return "medium";
  if (h.endsWith("substack.com")) return "substack";
  if (h === "youtube.com" || h === "youtu.be") return "youtube";
  if (h === "vimeo.com") return "vimeo";
  if (h === "x.com" || h === "twitter.com") return "x";
  if (h.endsWith("linkedin.com")) return "linkedin";
  if (h === "behance.net") return "behance";
  if (h === "dribbble.com") return "dribbble";
  if (h === "news.ycombinator.com") return "hackernews";
  if (h.endsWith("producthunt.com")) return "producthunt";
  return "web";
}
