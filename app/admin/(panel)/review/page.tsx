import { EntryAdminRow } from "@/components/admin/entry-admin-row";
import { Notice } from "@/components/ui";
import { entriesByStatus } from "@/lib/admin-queries";

export default async function ReviewPage() {
  const entries = await entriesByStatus("review", 100);
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Review queue</h1>
      <p className="mt-1 text-[14px] font-medium text-muted-5">
        Optional. Middle-band items wait here and are rejected automatically when they expire. Approvals and rejections feed source scoring.
      </p>
      <div className="mt-6 overflow-hidden rounded-card border border-line">
        {entries.length ? entries.map((e) => <EntryAdminRow key={e.id} e={e} mode="review" />) : <Notice>Nothing waiting.</Notice>}
      </div>
    </div>
  );
}
