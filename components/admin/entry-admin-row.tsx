import Link from "next/link";
import { blockCompany, blockDomain, setEntryStatus, toggleFeatured } from "@/app/admin/actions";
import type { AdminEntry } from "@/lib/admin-queries";
import { hostLabel, shortDate, typeLabel } from "@/lib/format";
import { Badge, SmallButton } from "./bits";

function Act({ action, fields, children, tone }: { action: (f: FormData) => Promise<void>; fields: Record<string, string>; children: React.ReactNode; tone?: "neutral" | "brand" | "danger" }) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SmallButton tone={tone}>{children}</SmallButton>
    </form>
  );
}

export function EntryAdminRow({ e, mode }: { e: AdminEntry; mode: "review" | "published" | "other" }) {
  const r = e.quality_reasons;
  return (
    <div className="flex gap-4 border-b border-line bg-surface p-4 last:border-0">
      {e.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.thumbnail_url} alt="" referrerPolicy="no-referrer" className="hidden h-[84px] w-[120px] shrink-0 rounded-btn object-cover sm:block" />
      ) : (
        <div className="hidden h-[84px] w-[120px] shrink-0 rounded-btn bg-surface-card sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-5">
          <Badge tone={e.quality_score >= 75 ? "good" : e.quality_score >= 55 ? "warn" : "bad"}>{e.quality_score}</Badge>
          <span>{typeLabel(e.type)}</span>·<span className="font-semibold text-ink-body">{e.company_name}</span>·<span>{hostLabel(e.source_url)}</span>·
          <span>{shortDate(e.published_at ?? e.created_at)}</span>
          {e.source_name ? <span>· via {e.source_name}</span> : null}
          {e.origin !== "pipeline" ? <Badge>{e.origin}</Badge> : null}
          {e.featured ? <Badge tone="good">featured</Badge> : null}
        </div>
        <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[15px] font-bold text-ink-body hover:text-brand">
          {e.title} ↗
        </a>
        <p className="mt-1 text-[13px] text-ink-body">{e.summary}</p>
        {r.rubric ? (
          <details className="mt-1.5 text-[12px] text-muted-5">
            <summary className="cursor-pointer">
              {Object.entries(r.rubric)
                .map(([k, v]) => `${k.replace("_", " ")} ${v.rating}`)
                .join(" · ")}
              {r.recency ? ` · recency ${r.recency.rating}` : ""}
              {r.caps?.length ? ` · ${r.caps.join("; ")}` : ""}
            </summary>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(r.rubric).map(([k, v]) => (
                <li key={k}>
                  <b>{k.replace("_", " ")}</b>: {v.note}
                </li>
              ))}
              {r.red_flags?.map((f) => (
                <li key={f} className="text-error-ink">
                  ⚑ {f}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mode === "review" ? (
            <>
              <Act action={setEntryStatus} fields={{ id: e.id, status: "published" }} tone="brand">
                Publish
              </Act>
              <Act action={setEntryStatus} fields={{ id: e.id, status: "rejected" }}>
                Reject
              </Act>
            </>
          ) : null}
          {mode === "published" ? (
            <>
              <Link href={`/work/${e.slug}`} className="inline-flex h-7 items-center rounded-btn border border-line-2 px-2.5 text-[12px] font-bold">
                View
              </Link>
              <Act action={setEntryStatus} fields={{ id: e.id, status: "unpublished" }} tone="danger">
                Unpublish
              </Act>
              <Act action={toggleFeatured} fields={{ id: e.id }}>
                {e.featured ? "Unfeature" : "Feature"}
              </Act>
            </>
          ) : null}
          {mode === "other" ? (
            <Act action={setEntryStatus} fields={{ id: e.id, status: "published" }}>
              Publish
            </Act>
          ) : null}
          <Act action={blockDomain} fields={{ url: e.source_url }} tone="danger">
            Block {hostLabel(e.source_url)}
          </Act>
          <Act action={blockCompany} fields={{ id: e.company_id }} tone="danger">
            Block {e.company_name}
          </Act>
        </div>
      </div>
    </div>
  );
}
