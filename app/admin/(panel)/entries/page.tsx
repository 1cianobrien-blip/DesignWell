import Link from "next/link";
import { EntryAdminRow } from "@/components/admin/entry-admin-row";
import { Notice } from "@/components/ui";
import { entriesByStatus } from "@/lib/admin-queries";

const TABS = ["published", "unpublished", "rejected"] as const;

export default async function EntriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = TABS.includes(sp.status as never) ? (sp.status as (typeof TABS)[number]) : "published";
  const entries = await entriesByStatus(status, 100);
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Entries</h1>
      <div className="mt-4 flex gap-4 text-[14px] font-semibold">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/entries?status=${t}`} className={t === status ? "text-brand" : "text-muted-5"}>
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-card border border-line">
        {entries.length ? entries.map((e) => <EntryAdminRow key={e.id} e={e} mode={status === "published" ? "published" : "other"} />) : <Notice>None.</Notice>}
      </div>
    </div>
  );
}
