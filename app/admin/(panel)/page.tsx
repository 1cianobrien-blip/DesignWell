import Link from "next/link";
import { Badge, Panel, Stat } from "@/components/admin/bits";
import { StackedBars } from "@/components/admin/charts";
import { candidatesByDay, costByDay, headline, recentRuns, topSources } from "@/lib/admin-queries";
import { spentToday } from "@/lib/llm";
import { getSettings } from "@/lib/settings";

// Categorical slots 1-4 from the validated reference palette, in fixed order.
const C = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

function ago(d: Date | null) {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

export default async function Dashboard() {
  const [h, days, costs, sources, runs, spent, settings] = await Promise.all([headline(), candidatesByDay(30), costByDay(30), topSources(15), recentRuns(10), spentToday(), getSettings()]);
  const outcomeData = days.map((d) => ({ day: d.day, published: d.published, review: d.review, rejected: d.rejected + d.discarded, other: d.pending + d.other }));
  const totals = days.reduce((a, d) => ({ found: a.found + d.found, published: a.published + d.published, review: a.review + d.review }), { found: 0, published: 0, review: 0 });
  const rate = totals.found ? Math.round((totals.published / totals.found) * 1000) / 10 : 0;
  const cost30 = costs.reduce((s, c) => s + c.cost, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Pipeline</h1>
          <p className="mt-1 text-[14px] font-medium text-muted-5">
            Last run {ago(h.last_run_at)}{" "}
            {h.last_run_status ? <Badge tone={h.last_run_status === "ok" ? "good" : h.last_run_status === "spend_cap" ? "warn" : "bad"}>{h.last_run_status}</Badge> : null}
            {!settings.pipeline_enabled ? (
              <>
                {" "}
                <Badge tone="bad">pipeline disabled</Badge>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Published, last 7 days" value={h.published_7d} sub={`${h.published_prev_7d} the week before`} />
        <Stat label="Found, last 7 days" value={h.found_7d} sub={`${rate}% published over 30 days`} />
        <Stat label="Median age at publish" value={h.median_age_days === null ? "–" : `${h.median_age_days.toFixed(1)}d`} sub="Freshness, last 14 days" />
        <Stat label="Review queue" value={<Link href="/admin/review">{h.review_queue}</Link>} sub={`Expires after ${settings.review_expiry_days} days`} />
        <Stat label="Spend today" value={`$${spent.toFixed(2)}`} sub={`Cap $${settings.daily_spend_cap_usd} · 7d $${h.cost_7d.toFixed(2)}`} />
        <Stat label="Companies · roles" value={`${h.companies} · ${h.open_roles}`} sub={`${h.sources_active} active sources, ${h.sources_paused} paused`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <StackedBars
          title={`What happened to items found each day (30 days: ${totals.found} found, ${totals.published} published, ${totals.review} queued)`}
          data={outcomeData}
          xKey="day"
          series={[
            { key: "published", label: "Published", color: C[0] },
            { key: "review", label: "Review", color: C[1] },
            { key: "rejected", label: "Rejected", color: C[2] },
            { key: "other", label: "Pending or other", color: C[3] },
          ]}
        />
        <StackedBars
          title={`Cost per day, USD (30 days: $${cost30.toFixed(2)})`}
          data={costs}
          xKey="day"
          unit="usd"
          series={[
            { key: "draft", label: "Drafting", color: C[0] },
            { key: "triage", label: "Triage", color: C[1] },
            { key: "search", label: "Search", color: C[2] },
            { key: "other", label: "Research", color: C[3] },
          ]}
        />
      </div>

      <Panel title="Top sources" action={<Link href="/admin/sources" className="text-[13px] font-bold text-brand">All sources →</Link>}>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted-5">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 text-right font-semibold">Found</th>
                <th className="px-3 py-2 text-right font-semibold">Published</th>
                <th className="px-3 py-2 text-right font-semibold">Rejected</th>
                <th className="px-3 py-2 text-right font-semibold">Hit rate</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const judged = s.published_count + s.rejected_count;
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="max-w-[360px] truncate px-3 py-2 font-semibold text-ink-body">
                      {s.name ?? s.url_or_query} <span className="font-medium text-muted-3">{s.type.replace("_", " ")}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.candidates_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.published_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.rejected_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{judged ? `${Math.round((s.published_count / judged) * 100)}%` : "–"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={s.status === "active" ? "good" : "warn"}>{s.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recent runs">
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted-5">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-semibold">Job</th>
                <th className="px-3 py-2 font-semibold">Started</th>
                <th className="px-3 py-2 text-right font-semibold">In</th>
                <th className="px-3 py-2 text-right font-semibold">Published</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="px-3 py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="px-3 py-2 font-semibold">{r.job_type}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-5">{ago(r.started_at)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.items_in}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.items_published}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${Number(r.cost_estimate).toFixed(3)}</td>
                  <td className="px-3 py-2">
                    {!r.finished_at ? (
                      <Badge>running</Badge>
                    ) : r.stopped_reason ? (
                      <Badge tone="warn">{r.stopped_reason}</Badge>
                    ) : r.errors.length ? (
                      <details>
                        <summary className="cursor-pointer">
                          <Badge tone="bad">{r.errors.length} errors</Badge>
                        </summary>
                        <ul className="mt-2 space-y-1 text-[12px] text-muted-5">
                          {r.errors.slice(0, 8).map((e, i) => (
                            <li key={i}>
                              <span className="text-ink-body">{e.context}</span> {e.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <Badge tone="good">ok</Badge>
                    )}
                    <span className="ml-2 text-[11px] text-muted-3">
                      {Object.entries(r.stats)
                        .slice(0, 6)
                        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
                        .join(" · ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
