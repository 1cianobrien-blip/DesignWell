// Get a readable view of a page: polite direct fetch first, Anthropic web fetch as a fallback.
import { extractPage, type PageInfo } from "@/lib/html";
import { FetchBlocked, politeFetch } from "@/lib/http";
import { webFetchText } from "@/lib/llm";

export type Page = PageInfo & { via: "direct" | "anthropic"; status: number; finalUrl: string };

export class PageUnavailable extends Error {}

export async function getPage(url: string, runId?: string | null): Promise<Page> {
  let direct: Page | null = null;
  try {
    const res = await politeFetch(url);
    if (res.status === 404 || res.status === 410) throw new PageUnavailable(`HTTP ${res.status}`);
    if (res.status < 400 && /html|xml/.test(res.contentType)) {
      direct = { ...extractPage(res.body, res.finalUrl), via: "direct", status: res.status, finalUrl: res.finalUrl };
      if (direct.wordCount >= 150) return direct;
    }
  } catch (e) {
    if (e instanceof FetchBlocked || e instanceof PageUnavailable) throw e;
    // network error, timeout: fall through to Anthropic web fetch
  }
  const fetched = await webFetchText({ url, runId });
  if (!fetched || fetched.text.trim().length < 200) {
    if (direct) return direct; // thin, but it's what there is
    throw new PageUnavailable("could not fetch page");
  }
  const text = fetched.text.replace(/\n{3,}/g, "\n\n").slice(0, 24_000);
  // Recover images from markdown-style links in the fetched text.
  const images = [...text.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]).filter((s) => !/\.svg(\?|$)/i.test(s)).slice(0, 12);
  return {
    ...(direct ?? { url, images: [], feeds: [], links: [], icons: [] }),
    title: direct?.title ?? fetched.title ?? undefined,
    images: direct?.images.length ? direct.images : images,
    image: direct?.image ?? images[0],
    text,
    wordCount: text.split(/\s+/).length,
    via: "anthropic",
    status: direct?.status ?? 200,
    finalUrl: direct?.finalUrl ?? url,
  };
}
