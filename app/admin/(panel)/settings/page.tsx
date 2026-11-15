import { saveSettings } from "@/app/admin/actions";
import { SmallButton } from "@/components/admin/bits";
import { spentToday } from "@/lib/llm";
import { getSettings } from "@/lib/settings";

const input = "h-9 w-28 rounded-btn border border-field-border bg-surface px-2.5 text-[14px] tabular-nums";

export default async function SettingsPage() {
  const [s, spent] = await Promise.all([getSettings(), spentToday()]);
  return (
    <div className="max-w-[640px]">
      <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">Settings</h1>
      <form action={saveSettings} className="mt-6 space-y-5 rounded-card border border-line bg-surface p-5 text-[14px]">
        <label className="flex items-center justify-between gap-4">
          <span>
            <b>Publish threshold</b>
            <br />
            <span className="text-muted-5">Score at or above this auto-publishes.</span>
          </span>
          <input name="publish_threshold" type="number" min={0} max={100} defaultValue={s.publish_threshold} className={input} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <b>Review threshold</b>
            <br />
            <span className="text-muted-5">Scores from here up to the publish threshold go to the review queue. Below it they're rejected.</span>
          </span>
          <input name="review_threshold" type="number" min={0} max={100} defaultValue={s.review_threshold} className={input} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <b>Review expiry (days)</b>
            <br />
            <span className="text-muted-5">Unreviewed items are rejected after this.</span>
          </span>
          <input name="review_expiry_days" type="number" min={1} max={90} defaultValue={s.review_expiry_days} className={input} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <b>Daily spending cap (USD)</b>
            <br />
            <span className="text-muted-5">Pipeline runs stop once today's API spend reaches this. Spent today: ${spent.toFixed(3)}.</span>
          </span>
          <input name="daily_spend_cap_usd" type="number" step="0.5" min={0} defaultValue={s.daily_spend_cap_usd} className={input} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <b>Pipeline enabled</b>
            <br />
            <span className="text-muted-5">Turn off to pause all scheduled runs.</span>
          </span>
          <input name="pipeline_enabled" type="checkbox" defaultChecked={s.pipeline_enabled} className="size-5 accent-[#b100de]" />
        </label>
        <SmallButton tone="brand">Save settings</SmallButton>
      </form>
    </div>
  );
}
