import type { ReactNode } from "react";

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[12px] font-semibold text-muted-5">{label}</p>
      <p className="mt-1 text-[26px] leading-tight font-bold tracking-[-0.03em] text-ink tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-[12px] font-medium text-muted-3">{sub}</p> : null}
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SmallButton({ children, tone = "neutral", ...rest }: { children: ReactNode; tone?: "neutral" | "brand" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls =
    tone === "brand" ? "bg-brand text-brand-ink border-brand" : tone === "danger" ? "border-error-border text-error-ink bg-surface hover:bg-error-bg" : "border-line-2 text-ink-body bg-surface hover:border-ink";
  return (
    <button {...rest} className={`h-7 rounded-btn border px-2.5 text-[12px] font-bold whitespace-nowrap ${cls}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "bg-[#f0fdf4] text-[#166534]" : tone === "warn" ? "bg-[#fffbeb] text-[#92400e]" : tone === "bad" ? "bg-error-bg text-error-ink" : "bg-surface-card text-muted-5";
  return <span className={`inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}
