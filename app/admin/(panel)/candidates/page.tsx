import Link from "next/link";
import { Badge } from "@/components/admin/bits";
import { recentCandidates, submissionsRecent } from "@/lib/admin-queries";
import { hostLabel, shortDate } from "@/lib/format";

const OUTCOMES = ["", "pending", "published", "review", "rejected", "discarded", "duplicate", "error", "skipped", "blocked"];

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const sp = await searchParams;
  const outcome = OUTCOMES.includes(sp.outcome ?? "") ? sp.outcome : undefined;
  const [rows, subs] = await Promise.all([recentCandidates({ outcome, limit: 150 }), submissionsRecent(20)]);
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Candidates</h1>
      <p className="mt-1 text-[14px] font-medium text-muted-5">Every collected item, with the stage it reached and why. For debugging and judging the experiment.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-semibold">
        {OUTCOMES.map((o) => (
          <Link key={o || "all"} href={o ? `/admin/candidates?outcome=${o}` : "/admin/candidates"} className={(outcome ?? "") === o ? "text-brand" : "text-muted-5"}>
            {o || "all"}
          </Link>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[12px] text-muted-5">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Outcome</th>
              <th className="px-3 py-2 text-right font-semibold">Score</th>
              <th className="px-3 py-2 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line align-top last:border-0">
                <td className="max-w-[420px] px-3 py-2">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-semibold text-ink-body hover:text-brand">
                    {c.title || c.url}
                  </a>
                  <span className="text-muted-3">
                    {hostLabel(c.url)} · {c.source_name ?? "submission"} · {shortDate(c.created_at)}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge tone={c.outcome === "published" ? "good" : c.outcome === "review" || c.outcome === "pending" ? "warn" : c.outcome === "error" ? "bad" : "neutral"}>{c.outcome}</Badge>{" "}
                  <span className="text-muted-3">{c.stage}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.quality_score ?? ""}</td>
                <td className="max-w-[380px] px-3 py-2 text-muted-5">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-[18px] font-bold text-ink">Recent submissions</h2>
      <ul className="mt-3 space-y-1 text-[13px]">
        {subs.map((s) => (
          <li key={s.id} className="flex gap-2">
            <Badge>{s.status}</Badge>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold hover:text-brand">
              {s.url}
            </a>
            <span className="truncate text-muted-3">{s.reason ?? s.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
