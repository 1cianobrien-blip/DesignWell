// Claude wrapper: structured calls, per-call cost logging, and the daily spending cap.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { sql } from "./db";
import { getSettings } from "./settings";

export const MODELS = {
  // Cheap model for triage, search and research; stronger model for drafting. All overridable.
  triage: process.env.MODEL_TRIAGE ?? "claude-haiku-5-5",
  search: process.env.MODEL_SEARCH ?? "claude-haiku-5-5",
  draft: process.env.MODEL_DRAFT ?? "claude-opus-5-5",
  research: process.env.MODEL_RESEARCH ?? "claude-haiku-5-5",
};

// USD per million tokens: [input, output, cache read]. Keep in sync with Anthropic pricing.
const PRICES: Record<string, [number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.1],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
  "claude-fable-5-2": [8, 40, 0.2],
};
const WEB_SEARCH_PER_USE = 0.01; // $10 per 1,000 searches

// Models that accept server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-fable-5-2", "claude-sonnet-5-5"]);

let _client: Anthropic | null = null;
function client() {
  // baseURL is explicit so an ambient ANTHROPIC_BASE_URL (e.g. a dev tool's proxy) is never used.
  _client ??= new Anthropic({
    apiKey: process.env.DW_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.DW_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    maxRetries: 3,
  });
  return _client;
}

export class SpendCapReached extends Error {
  constructor(
    public spent: number,
    public cap: number,
  ) {
    super(`Daily spend cap reached: $${spent.toFixed(2)} of $${cap.toFixed(2)}`);
  }
}

export async function spentToday(): Promise<number> {
  const [r] = await sql<{ total: string }[]>`
    select coalesce(sum(cost), 0) as total from llm_calls
    where created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;
  return Number(r.total);
}

export async function assertBudget(): Promise<void> {
  const { daily_spend_cap_usd } = await getSettings();
  const spent = await spentToday();
  if (spent >= daily_spend_cap_usd) throw new SpendCapReached(spent, daily_spend_cap_usd);
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null;
};

export function costOf(model: string, u: Usage): number {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k)) ?? "claude-opus-5-5";
  const [pin, pout, pcache] = PRICES[key];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (u.input_tokens * pin + cacheWrite * pin * 1.25 + cacheRead * pcache + u.output_tokens * pout) / 1e6 + searches * WEB_SEARCH_PER_USE;
}

async function logCall(runId: string | null, purpose: string, model: string, u: Usage) {
  const cost = costOf(model, u);
  const tokens = u.input_tokens + u.output_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const tools = (u.server_tool_use?.web_search_requests ?? 0) + (u.server_tool_use?.web_fetch_requests ?? 0);
  await sql`insert into llm_calls (run_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, server_tool_uses, cost)
            values (${runId}, ${purpose}, ${model}, ${u.input_tokens}, ${u.output_tokens}, ${u.cache_read_input_tokens ?? 0}, ${tools}, ${cost})`;
  if (runId) {
    await sql`update agent_runs set tokens_used = tokens_used + ${tokens}, cost_estimate = cost_estimate + ${cost} where id = ${runId}`;
  }
  return cost;
}

export type StructuredResult<T> = { data: T | null; refused: boolean; stopReason: string | null; cost: number };

/** One structured-output call. Checks the spending cap first and logs the cost afterwards. */
export async function structured<S extends z.ZodType>(opts: {
  purpose: string;
  model: string;
  system: string;
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  runId?: string | null;
}): Promise<StructuredResult<z.infer<S>>> {
  await assertBudget();
  const useFallback = FALLBACK_MODELS.has(opts.model);
  const stream = client().beta.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16_000,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const msg = await stream.finalMessage();
  const cost = await logCall(opts.runId ?? null, opts.purpose, msg.model ?? opts.model, msg.usage as Usage);
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") {
    return { data: null, refused: msg.stop_reason === "refusal", stopReason: msg.stop_reason, cost };
  }
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let data: z.infer<S> | null = null;
  try {
    const parsed = opts.schema.safeParse(JSON.parse(text));
    data = parsed.success ? parsed.data : null;
  } catch {
    data = null;
  }
  return { data, refused: false, stopReason: msg.stop_reason, cost };
}

/**
 * Fallback page fetch through Anthropic's web fetch tool, for pages our crawler can't read directly
 * (bot walls, JS-rendered pages). Returns the fetched document text, or null on failure.
 */
export async function webFetchText(opts: { url: string; runId?: string | null; maxContentTokens?: number }): Promise<{ text: string; title: string | null } | null> {
  await assertBudget();
  const model = MODELS.search;
  const modern = !/haiku/.test(model);
  const tool = {
    type: modern ? "web_fetch_20260209" : "web_fetch_20250910",
    name: "web_fetch",
    max_uses: 1,
    max_content_tokens: opts.maxContentTokens ?? 12_000,
  } as unknown as Anthropic.ToolUnion;
  const msg = await client().messages.create({
    model,
    max_tokens: 1_000,
    output_config: { effort: "low" },
    tools: [tool],
    messages: [{ role: "user", content: `Fetch this URL with the web_fetch tool, then reply "done".\n\n${opts.url}` }],
  });
  await logCall(opts.runId ?? null, "fetch", model, msg.usage as Usage);
  for (const b of msg.content) {
    if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") {
      const src = b.content.content.source;
      if (src.type === "text") return { text: src.data, title: b.content.content.title };
    }
  }
  return null;
}

export type SearchHit ={ url: string; title: string; pageAge?: string | null };

/**
 * Runs Anthropic web search and returns the raw result list. Only URLs and titles from the
 * search tool are used; nothing the model writes is trusted as data.
 */
export async function webSearch(opts: {
  query: string;
  purpose: string;
  runId?: string | null;
  maxUses?: number;
  instructions?: string;
  blockedDomains?: string[];
}): Promise<SearchHit[]> {
  await assertBudget();
  const model = MODELS.search;
  const modern = !/haiku/.test(model);
  const tool = {
    type: modern ? "web_search_20260209" : "web_search_20250305",
    name: "web_search",
    max_uses: opts.maxUses ?? 2,
    ...(opts.blockedDomains?.length ? { blocked_domains: opts.blockedDomains.slice(0, 64) } : {}),
  } as unknown as Anthropic.ToolUnion;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${opts.instructions ?? "Search the web for this query."}\n\nQuery: ${opts.query}\n\nReply with just "done" once you have searched.`,
    },
  ];
  const hits: SearchHit[] = [];
  for (let i = 0; i < 3; i++) {
    const msg = await client().messages.create({
      model,
      max_tokens: 2_000,
      output_config: { effort: "low" },
      tools: [tool],
      messages,
    });
    await logCall(opts.runId ?? null, opts.purpose, model, msg.usage as Usage);
    for (const b of msg.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") hits.push({ url: r.url, title: r.title, pageAge: r.page_age });
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)));
}
