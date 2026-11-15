import { addSource, blockDomain, setSourceStatus, unblockDomain } from "@/app/admin/actions";
import { Badge, SmallButton } from "@/components/admin/bits";
import { allSources, blockedDomains } from "@/lib/admin-queries";
import { shortDate } from "@/lib/format";

function StatusForm({ id, status, label, tone }: { id: string; status: string; label: string; tone?: "neutral" | "danger" }) {
  return (
    <form action={setSourceStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SmallButton tone={tone}>{label}</SmallButton>
    </form>
  );
}

const input = "h-8 rounded-btn border border-field-border bg-surface px-2.5 text-[13px]";

export default async function SourcesPage() {
  const [sources, blocked] = await Promise.all([allSources(), blockedDomains()]);
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Sources</h1>
      <p className="mt-1 text-[14px] font-medium text-muted-5">
        Sources with mostly rejected candidates are paused automatically. Company channels are added by snowball research when a company gets its first published entry.
      </p>

      <form action={addSource} className="mt-5 flex flex-wrap gap-2">
        <select name="type" className={input}>
          <option value="rss">RSS / Atom feed</option>
          <option value="search_query">Search query</option>
          <option value="api">API (hn:query)</option>
        </select>
        <input name="value" required placeholder="Feed URL or query" className={`${input} min-w-[280px] flex-1`} />
        <input name="name" placeholder="Name (optional)" className={input} />
        <SmallButton tone="brand">Add source</SmallButton>
      </form>

      <div className="mt-5 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[12px] text-muted-5">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 text-right font-semibold">Found</th>
              <th className="px-3 py-2 text-right font-semibold">Pub.</th>
              <th className="px-3 py-2 text-right font-semibold">Rej.</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Checked</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-line align-top last:border-0">
                <td className="max-w-[420px] px-3 py-2">
                  <p className="font-semibold text-ink-body">
                    {s.name ?? s.url_or_query} <span className="font-medium text-muted-3">{s.type.replace("_", " ")}</span>
                    {s.company_name ? <span className="font-medium text-muted-3"> · {s.company_name}</span> : null}
                  </p>
                  <p className="truncate text-muted-3">{s.url_or_query}</p>
                  {s.last_error ? <p className="text-error-ink">{s.last_error}</p> : null}
                  {s.paused_reason ? <p className="text-[#92400e]">{s.paused_reason}</p> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.candidates_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.published_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.rejected_count}</td>
                <td className="px-3 py-2">
                  <Badge tone={s.status === "active" ? "good" : s.status === "paused" ? "warn" : "bad"}>{s.status}</Badge>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-5">{s.last_checked_at ? shortDate(s.last_checked_at) : "never"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    {s.status === "active" ? <StatusForm id={s.id} status="paused" label="Pause" /> : <StatusForm id={s.id} status="active" label="Resume" />}
                    {s.status !== "blocked" ? <StatusForm id={s.id} status="blocked" label="Block" tone="danger" /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-[18px] font-bold text-ink">Blocked domains</h2>
      <form action={blockDomain} className="mt-3 flex flex-wrap gap-2">
        <input name="domain" required placeholder="example.com" className={input} />
        <input name="reason" placeholder="Reason (optional)" className={`${input} min-w-[240px]`} />
        <SmallButton tone="danger">Block domain</SmallButton>
      </form>
      <ul className="mt-3 space-y-1.5 text-[13px]">
        {blocked.map((b) => (
          <li key={b.domain} className="flex items-center gap-3">
            <span className="font-semibold">{b.domain}</span>
            <span className="text-muted-3">{b.reason}</span>
            <form action={unblockDomain}>
              <input type="hidden" name="domain" value={b.domain} />
              <SmallButton>Unblock</SmallButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
