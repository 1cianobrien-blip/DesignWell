import { parse, type HTMLElement } from "node-html-parser";

export type PageInfo = {
  url: string;
  canonical?: string;
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  images: string[];
  publishedAt?: string;
  author?: string;
  lang?: string;
  feeds: string[];
  links: { href: string; text: string }[];
  icons: string[];
  themeColor?: string;
  text: string; // main readable text, truncated
  wordCount: number;
  oembed?: string;
};

function abs(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return undefined;
  }
}

function meta(root: HTMLElement, ...names: string[]): string | undefined {
  for (const n of names) {
    const el = root.querySelector(`meta[property="${n}"]`) ?? root.querySelector(`meta[name="${n}"]`) ?? root.querySelector(`meta[itemprop="${n}"]`);
    const c = el?.getAttribute("content")?.trim();
    if (c) return c;
  }
  return undefined;
}

function jsonLd(root: HTMLElement): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const v = JSON.parse(s.text);
      const items = Array.isArray(v) ? v : v["@graph"] ? v["@graph"] : [v];
      for (const i of items) if (i && typeof i === "object") out.push(i);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function extractPage(html: string, url: string, maxChars = 24_000): PageInfo {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const ld = jsonLd(root);
  const ldArticle = ld.find((i) => /Article|BlogPosting|NewsArticle|VideoObject|CreativeWork/.test(String(i["@type"])));
  const ldDate = (ldArticle?.datePublished ?? ldArticle?.uploadDate) as string | undefined;

  const feeds = root
    .querySelectorAll('link[rel="alternate"]')
    .filter((l) => /rss|atom|feed/i.test(l.getAttribute("type") ?? ""))
    .map((l) => abs(l.getAttribute("href"), url))
    .filter(Boolean) as string[];

  const icons = root
    .querySelectorAll("link[rel]")
    .filter((l) => /icon|apple-touch-icon/i.test(l.getAttribute("rel") ?? ""))
    .sort((a, b) => {
      const size = (el: HTMLElement) => Number((el.getAttribute("sizes") ?? "0").split("x")[0]) || (/apple/.test(el.getAttribute("rel") ?? "") ? 180 : 16);
      return size(b) - size(a);
    })
    .map((l) => abs(l.getAttribute("href"), url))
    .filter(Boolean) as string[];

  const links = root
    .querySelectorAll("a[href]")
    .map((a) => ({ href: abs(a.getAttribute("href"), url) ?? "", text: a.text.replace(/\s+/g, " ").trim().slice(0, 80) }))
    .filter((l) => l.href.startsWith("http"));

  // Main text: prefer <article>, then <main>, then body; strip chrome.
  for (const sel of ["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe", "aside"]) {
    root.querySelectorAll(sel).forEach((n) => n.remove());
  }
  const main = root.querySelector("article") ?? root.querySelector("main") ?? root.querySelector("body") ?? root;
  const images = main
    .querySelectorAll("img")
    .map((i) => abs(i.getAttribute("src") ?? i.getAttribute("data-src") ?? undefined, url))
    .filter((s): s is string => !!s && !s.startsWith("data:") && !/\.svg(\?|$)/i.test(s))
    .slice(0, 12);
  const blocks = main.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,figcaption,pre");
  let text = blocks.length > 3 ? blocks.map((b) => (/^H\d$/.test(b.tagName) ? `\n## ${b.text.trim()}` : b.text.trim())).filter(Boolean).join("\n") : main.text;
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const ogImage = abs(meta(root, "og:image", "og:image:url", "twitter:image", "twitter:image:src"), url);
  const ldImage = ldArticle?.image as unknown;
  const ldImageUrl = typeof ldImage === "string" ? ldImage : Array.isArray(ldImage) ? (typeof ldImage[0] === "string" ? ldImage[0] : (ldImage[0] as { url?: string })?.url) : (ldImage as { url?: string })?.url;

  const author = ldArticle?.author as unknown;
  const authorName = Array.isArray(author) ? (author[0] as { name?: string })?.name : (author as { name?: string })?.name ?? (typeof author === "string" ? author : undefined);

  return {
    url,
    canonical: abs(root.querySelector('link[rel="canonical"]')?.getAttribute("href"), url),
    title: meta(root, "og:title", "twitter:title") ?? root.querySelector("title")?.text.trim(),
    description: meta(root, "og:description", "description", "twitter:description"),
    siteName: meta(root, "og:site_name", "application-name"),
    image: ogImage ?? abs(ldImageUrl, url),
    images,
    publishedAt: meta(root, "article:published_time", "datePublished", "pubdate", "date", "parsely-pub-date", "sailthru.date") ?? ldDate ?? root.querySelector("time[datetime]")?.getAttribute("datetime"),
    author: meta(root, "author", "article:author") ?? authorName,
    lang: root.querySelector("html")?.getAttribute("lang"),
    feeds,
    links,
    icons,
    themeColor: meta(root, "theme-color", "msapplication-TileColor"),
    text: text.slice(0, maxChars),
    wordCount,
    oembed: abs(root.querySelector('link[type="application/json+oembed"]')?.getAttribute("href"), url),
  };
}
