import { sql } from "@/lib/db";

export type Run = {
  id: string;
  jobType: string;
  itemsIn: number;
  published: number;
  errors: { at: string; message: string; context?: string }[];
  stats: Record<string, number>;
  stoppedReason: string | null;
};

export async function startRun(jobType: string): Promise<Run> {
  const [r] = await sql<{ id: string }[]>`insert into agent_runs (job_type) values (${jobType}) returning id`;
  return { id: r.id, jobType, itemsIn: 0, published: 0, errors: [], stats: {}, stoppedReason: null };
}

export function bump(run: Run, key: string, n = 1) {
  run.stats[key] = (run.stats[key] ?? 0) + n;
}

export function recordError(run: Run, e: unknown, context?: string) {
  const message = e instanceof Error ? e.message : String(e);
  run.errors.push({ at: new Date().toISOString(), message: message.slice(0, 500), context });
  console.error(`[${run.jobType}] ${context ?? ""} ${message}`);
}

export async function finishRun(run: Run) {
  await sql`update agent_runs set finished_at = now(), items_in = ${run.itemsIn}, items_published = ${run.published},
            errors = ${sql.json(run.errors.slice(0, 200))}, stats = ${sql.json(run.stats)}, stopped_reason = ${run.stoppedReason}
            where id = ${run.id}`;
  const [r] = await sql<{ cost_estimate: string; tokens_used: string }[]>`select cost_estimate, tokens_used from agent_runs where id = ${run.id}`;
  console.log(
    `[${run.jobType}] done: in=${run.itemsIn} published=${run.published} errors=${run.errors.length} cost=$${Number(r.cost_estimate).toFixed(4)} tokens=${r.tokens_used}` +
      (run.stoppedReason ? ` stopped=${run.stoppedReason}` : "") +
      ` stats=${JSON.stringify(run.stats)}`,
  );
}
