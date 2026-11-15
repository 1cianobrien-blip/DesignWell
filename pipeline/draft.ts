// Drafting + scoring agent: URL in, structured scored draft out.
import { z } from "zod";
import { MODELS, structured } from "@/lib/llm";
import { canonicalUrl, hostOf, platformOf } from "@/lib/url";
import { getPage, type Page } from "./page";
import { ENTRY_TYPES, TAGS } from "./taxonomy";

const Criterion = z.object({
  rating: z.number().int().min(0).max(10).describe("0 = not at all, 10 = exceptionally"),
  note: z.string().describe("One short sentence of evidence from the source"),
});

export const DraftSchema = z.object({
  is_company_design_work: z
    .boolean()
    .describe("True only if the page presents design work done by or at one specific, real company (in-house team or agency work for a named client)."),
  not_company_work_reason: z.string().nullable().describe("If false, why (e.g. generic advice, listicle, tool marketing, personal concept work, recruiter post)."),
  title: z.string().describe("A clean title for the work, in sentence case, max 90 characters. Name the work, not the publisher."),
  type: z.enum(ENTRY_TYPES),
  company: z.object({
    name: z.string().describe("The company whose product/brand the work is for. For agency work, the client. Not the publisher."),
    website: z.string().nullable().describe("Company homepage URL. Use the page's own links if present; otherwise only if you are certain. Else null."),
    agency: z.string().nullable().describe("Agency or studio credited, if any"),
  }),
  published_at: z.string().nullable().describe("Publication date as YYYY-MM-DD, only if stated in the page or metadata. Else null."),
  thumbnail_index: z.number().int().nullable().describe("Index into the candidate image list of the best image showing the work; null if none is suitable"),
  summary: z
    .string()
    .describe("One line, max 160 characters, editorial voice: why this is worth a designer's time. Original wording, no quoting, no hype words."),
  tags: z.array(z.enum(TAGS)).describe("2 to 5 tags"),
  rubric: z.object({
    real_work: Criterion.describe("Real shipped or in-progress work from a real company, not hypothetical, concept or spec work"),
    decisions: Criterion.describe("Shows or explains actual design decisions, trade-offs, outcomes or craft"),
    usefulness: Criterion.describe("A working product or brand designer would find it interesting or useful"),
    substance: Criterion.describe("Substantive, not a thin announcement or promotional fluff"),
  }),
  notable_older_piece: z.boolean().describe("True only if older than 12 months but a widely referenced or landmark piece"),
  red_flags: z.array(z.string()).describe("Problems: paywalled teaser, mostly marketing copy, AI-generated filler, recruiting post, duplicate of another write-up, etc."),
});
export type DraftOutput = z.infer<typeof DraftSchema>;

export type Draft = DraftOutput & {
  source_url: string;
  canonical_url: string;
  source_platform: string;
  thumbnail_url: string | null;
  quality_score: number;
  quality_reasons: {
    rubric: DraftOutput["rubric"];
    recency: { rating: number; note: string };
    red_flags: string[];
    caps: string[];
    model: string;
    fetched_via: string;
  };
  page_title?: string;
  page_links: { href: string; text: string }[];
  page_feeds: string[];
  cost: number;
};

const SYSTEM = `You are the editor of DesignWell, a site where designers discover great design work happening inside companies. From the work, readers discover the company and its open design roles.

You will be given the extracted contents of one web page. Produce a structured draft entry for it.

Rules:
- Work only from the page content and metadata provided. Never invent facts, dates, numbers, people or outcomes. If something is not in the source, leave it null or say less.
- The company is whoever the work is for (e.g. a Brand New review of Stripe's rebrand is Stripe's work; an agency case study for Spotify is Spotify's work, credit the agency). The publisher is not the company unless it is publishing its own work.
- Pages that are generic advice, listicles, roundups of many companies, tool or plugin marketing, templates, personal portfolio concepts or redesign exercises, job adverts, recruiter posts, course promotions or news with no design substance are not company design work.
- Type: case_study = an in-depth write-up of a project; launch = a new product/feature/site with design notes; brand = identity, rebrand, logo, type, visual language; talk = a video or conference talk; process = how a team works (rituals, tooling, design system governance, research ops); post = anything else substantive.
- The summary is one line in a crisp, knowledgeable editorial voice saying why it's worth looking at. No quotes from the page, no superlatives like "stunning" or "game-changing", no "In this article". Max 160 characters.
- Rate each rubric criterion honestly from 0 to 10. Most pages are average; reserve 8+ for genuinely excellent material. A thin press release should score low on decisions and substance even if the company is famous.`;

function rubricScore(d: DraftOutput, recency: number): { score: number; caps: string[] } {
  const r = d.rubric;
  // Weights sum to 100. Tune here.
  let score = r.real_work.rating * 2 + r.decisions.rating * 3 + r.usefulness.rating * 2.5 + r.substance.rating * 1.5 + recency * 1;
  const caps: string[] = [];
  if (!d.is_company_design_work) {
    score = Math.min(score, 20);
    caps.push("not company design work (cap 20)");
  }
  if (r.real_work.rating <= 3) {
    score = Math.min(score, 40);
    caps.push("not clearly real work (cap 40)");
  }
  if (r.substance.rating <= 3) {
    score = Math.min(score, 50);
    caps.push("thin content (cap 50)");
  }
  if (d.red_flags.length >= 2) {
    score -= 5 * (d.red_flags.length - 1);
    caps.push(`${d.red_flags.length} red flags (-${5 * (d.red_flags.length - 1)})`);
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), caps };
}

function recencyRating(publishedAt: string | null, notableOlder: boolean): { rating: number; note: string } {
  if (!publishedAt) return { rating: 6, note: "date unknown" };
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return { rating: 6, note: "date unparseable" };
  const months = (Date.now() - t) / (30.44 * 24 * 3600 * 1000);
  if (months < 0) return { rating: 6, note: "date in the future" };
  if (months <= 3) return { rating: 10, note: "under 3 months old" };
  if (months <= 12) return { rating: 8, note: "under 12 months old" };
  if (notableOlder) return { rating: 7, note: "older but notable" };
  if (months <= 24) return { rating: 3, note: "1-2 years old" };
  return { rating: 0, note: "over 2 years old" };
}

function normaliseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function pageBrief(page: Page, images: string[], hints?: { title?: string; snippet?: string }): string {
  const meta = {
    url: page.finalUrl,
    host: hostOf(page.finalUrl),
    title: page.title,
    site_name: page.siteName,
    description: page.description,
    author: page.author,
    published_time_metadata: page.publishedAt,
    word_count: page.wordCount,
    fetched_via: page.via,
  };
  const outbound = page.links
    .filter((l) => hostOf(l.href) !== hostOf(page.finalUrl))
    .slice(0, 40)
    .map((l) => `- ${l.text || "(no text)"} → ${l.href}`)
    .join("\n");
  return [
    `<metadata>\n${JSON.stringify(meta, null, 2)}\n</metadata>`,
    hints?.title || hints?.snippet ? `<feed_item>\n${hints.title ?? ""}\n${hints.snippet ?? ""}\n</feed_item>` : "",
    `<candidate_images>\n${images.map((u, i) => `${i}: ${u}`).join("\n") || "(none)"}\n</candidate_images>`,
    `<outbound_links>\n${outbound || "(none)"}\n</outbound_links>`,
    `<page_text>\n${page.text}\n</page_text>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Fetch a URL and produce a scored draft. Throws PageUnavailable / FetchBlocked when the page can't be read. */
export async function draftFromUrl(url: string, opts: { runId?: string | null; hints?: { title?: string; snippet?: string }; page?: Page } = {}): Promise<Draft | null> {
  const page = opts.page ?? (await getPage(url, opts.runId));
  const images = [...new Set([page.image, ...page.images].filter((s): s is string => !!s))].slice(0, 10);
  const res = await structured({
    purpose: "draft",
    model: MODELS.draft,
    system: SYSTEM,
    user: pageBrief(page, images, opts.hints),
    schema: DraftSchema,
    effort: (process.env.DRAFT_EFFORT as "low" | "medium" | "high") ?? "medium",
    maxTokens: 16_000,
    runId: opts.runId,
  });
  if (!res.data) return null;
  const d = res.data;
  const published = normaliseDate(d.published_at) ?? normaliseDate(page.publishedAt);
  const recency = recencyRating(published, d.notable_older_piece);
  const { score, caps } = rubricScore(d, recency.rating);
  const thumb = d.thumbnail_index !== null && images[d.thumbnail_index] ? images[d.thumbnail_index] : (page.image ?? null);
  const finalUrl = page.canonical && hostOf(page.canonical) === hostOf(page.finalUrl) ? page.canonical : page.finalUrl;
  return {
    ...d,
    summary: d.summary.length > 200 ? d.summary.slice(0, 197).replace(/\s+\S*$/, "") + "…" : d.summary,
    tags: [...new Set(d.tags)].slice(0, 5),
    published_at: published,
    source_url: finalUrl,
    canonical_url: canonicalUrl(finalUrl),
    source_platform: platformOf(finalUrl),
    thumbnail_url: thumb,
    quality_score: score,
    quality_reasons: { rubric: d.rubric, recency, red_flags: d.red_flags, caps, model: MODELS.draft, fetched_via: page.via },
    page_title: page.title,
    page_links: page.links,
    page_feeds: page.feeds,
    cost: res.cost,
  };
}
