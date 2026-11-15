// Cheap triage: is this item design work done by or at a specific company?
import { z } from "zod";
import { MODELS, structured } from "@/lib/llm";

export const TriageSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      keep: z.boolean(),
      company: z.string().nullable().describe("The company whose design work it is, if identifiable"),
      priority: z
        .number()
        .int()
        .min(0)
        .max(10)
        .describe("For kept items: how likely this is an excellent, substantive piece a working designer would want to see. 10 = in-depth write-up of notable work; 3 = thin or uncertain. 0 for discarded items."),
      reason: z.string().describe("Max 12 words"),
    }),
  ),
});

const SYSTEM = `You triage links for DesignWell, a feed of real design work happening inside companies (product design case studies, rebrands and identities, launches with design notes, design system write-ups, design talks, how design teams work).

For each item decide keep=true only if it is very likely about design work done by or at one specific, identifiable company (in-house, or an agency's work for a named client).

Discard (keep=false): generic advice and how-tos, listicles and roundups across many companies, opinion pieces with no specific company work, tool/plugin/template/UI-kit marketing, personal portfolio or concept/redesign exercises, job adverts and recruiter posts, courses and webinars, funding or business news with no design angle, AI image dumps, and anything without a clear company link.

When unsure but plausible, keep it: a stronger model reviews kept items in full. Only a limited number of kept items can be reviewed each week, so give each kept item an honest priority: primary sources (the company's own write-up) and in-depth pieces from well-known teams rank highest; short news items and announcements rank lower.`;

export type TriageItem = { id: number; title: string; url: string; snippet?: string | null; source?: string | null };
export type TriageVerdict = { keep: boolean; company: string | null; priority: number; reason: string };

export async function triageBatch(items: TriageItem[], runId?: string | null): Promise<Map<number, TriageVerdict>> {
  const out = new Map<number, TriageVerdict>();
  if (!items.length) return out;
  const user = items
    .map((i) => `<item id="${i.id}">\ntitle: ${i.title}\nurl: ${i.url}\nsource: ${i.source ?? ""}\nsnippet: ${(i.snippet ?? "").replace(/\s+/g, " ").slice(0, 400)}\n</item>`)
    .join("\n");
  const res = await structured({
    purpose: "triage",
    model: MODELS.triage,
    system: SYSTEM,
    user: `${user}\n\nReturn a verdict for every item id.`,
    schema: TriageSchema,
    effort: "low",
    maxTokens: 8_000,
    runId,
  });
  for (const v of res.data?.items ?? []) out.set(v.id, { keep: v.keep, company: v.company, priority: v.priority, reason: v.reason });
  return out;
}
