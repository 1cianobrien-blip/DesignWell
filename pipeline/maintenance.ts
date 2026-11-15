// Housekeeping: source scoring (auto-pause), review-queue expiry.
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { bump, type Run } from "./run";

/** Pause sources whose candidates are consistently rejected or discarded. Company channels get more slack. */
export async function scoreSources(run: Run) {
  const s = await getSettings();
  const rows = await sql<{ id: string; name: string; type: string; published_count: number; rejected_count: number }[]>`
    select id, name, type, published_count, rejected_count from sources
    where status = 'active' and (published_count + rejected_count) >= ${s.source_pause_min_candidates}`;
  for (const r of rows) {
    const judged = r.published_count + r.rejected_count;
    const rejectRate = r.rejected_count / judged;
    const limit = r.type === "company_channel" ? Math.min(0.97, s.source_pause_max_reject_rate + 0.05) : s.source_pause_max_reject_rate;
    if (rejectRate >= limit) {
      const reason = `auto-paused: ${r.rejected_count}/${judged} rejected (${Math.round(rejectRate * 100)}%), ${r.published_count} published`;
      await sql`update sources set status = 'paused', paused_reason = ${reason} where id = ${r.id}`;
      bump(run, "sources_paused");
      console.log(`  paused ${r.name}: ${reason}`);
    }
  }
}

/** Review items expire after N days if the owner hasn't reviewed them. */
export async function expireReviews(run: Run) {
  const rows = await sql`
    update entries set status = 'rejected', reviewed_at = now(),
      quality_reasons = quality_reasons || '{"expired": true}'::jsonb
    where status = 'review' and review_expires_at is not null and review_expires_at < now()
    returning id`;
  bump(run, "reviews_expired", rows.length);
}
