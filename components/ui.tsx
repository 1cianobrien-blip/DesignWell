// Base components rebuilt from the Framer site: Nav, Footer, Button, Section, SectionHeader, Pill, Notice, Logo tile.
import Link from "next/link";
import type { ReactNode } from "react";
import { isLight, tileColor } from "@/lib/format";

export function Container({ children, width = "content", className = "" }: { children: ReactNode; width?: "content" | "narrow" | "jobs"; className?: string }) {
  const max = width === "content" ? "max-w-content" : width === "narrow" ? "max-w-narrow" : "max-w-jobs";
  return <div className={`mx-auto w-full px-5 lg:px-0 ${max} ${className}`}>{children}</div>;
}

export function Nav() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-[76px] w-full max-w-content items-center justify-between px-5 lg:px-0">
        <Link href="/" className="font-wordmark text-[20px] leading-[28px] font-bold tracking-[-0.06em] text-ink-strong" aria-label="DesignWell home">
          DesignWell
        </Link>
        <nav className="flex items-center gap-4 text-[13px] leading-[15.6px] font-medium text-ink-strong lg:gap-8">
          <Link href="/companies" className="hover:text-brand">
            Companies
          </Link>
          <Link href="/jobs" className="hover:text-brand">
            Jobs
          </Link>
        </nav>
        <Button href="/submit">Submit work</Button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-content flex-col gap-3 px-5 py-8 text-[13px] text-muted-3 lg:flex-row lg:items-center lg:justify-between lg:px-0">
        <span className="font-wordmark text-[16px] font-bold tracking-[-0.06em] text-ink-strong">DesignWell</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-ink">
            Work
          </Link>
          <Link href="/companies" className="hover:text-ink">
            Companies
          </Link>
          <Link href="/jobs" className="hover:text-ink">
            Jobs
          </Link>
          <Link href="/submit" className="hover:text-ink">
            Submit work
          </Link>
          <Link href="/about" className="hover:text-ink">
            About
          </Link>
        </div>
      </div>
    </footer>
  );
}

type ButtonProps = { children: ReactNode; href?: string; variant?: "primary" | "secondary"; type?: "button" | "submit"; className?: string; external?: boolean; disabled?: boolean };

export function Button({ children, href, variant = "primary", type = "button", className = "", external, disabled }: ButtonProps) {
  const cls =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-btn px-4 text-[14px] leading-[16.8px] font-bold whitespace-nowrap transition-opacity hover:opacity-85 disabled:opacity-50 " +
    (variant === "primary" ? "bg-brand text-brand-ink" : "border border-brand bg-transparent text-brand") +
    " " +
    className;
  if (href) {
    return external ? (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled}>
      {children}
    </button>
  );
}

export function Section({ children, alt = false, className = "" }: { children: ReactNode; alt?: boolean; className?: string }) {
  return <section className={`py-14 lg:py-20 ${alt ? "bg-surface-alt" : "bg-surface"} ${className}`}>{children}</section>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 lg:mb-10">
      <div>
        <h2 className="t-section text-ink">{title}</h2>
        {subtitle ? <p className="t-sub mt-2 text-muted-2">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** The translucent pill used for "Hiring" on the Framer cards; reused for entry types. */
export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-pill bg-white/50 px-2.5 py-[5px] text-[13px] leading-[15.6px] font-semibold text-ink backdrop-blur-sm ${className}`}>{children}</span>;
}

/** Filter chip: an outlined version of the secondary button. */
export function Chip({ children, href, active }: { children: ReactNode; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex h-8 items-center rounded-pill border px-3.5 text-[13px] font-semibold transition-colors ${
        active ? "border-brand bg-brand text-brand-ink" : "border-line-2 bg-surface text-ink-body hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </Link>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "error" | "success" }) {
  const cls =
    tone === "error"
      ? "border-error-border bg-error-bg text-error-ink"
      : tone === "success"
        ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
        : "border-line bg-surface-alt text-muted-5";
  return <div className={`rounded-field border p-4 text-[14px] font-medium ${cls}`}>{children}</div>;
}

/** Square logo tile: the company's colour with its logo centred, like the Framer company cards. */
export function LogoTile({ name, logo, color, size = "card", className = "" }: { name: string; logo: string | null; color?: string | null; size?: "card" | "lg" | "md" | "sm"; className?: string }) {
  const bg = tileColor(name, color);
  const dims = size === "lg" ? "size-[85px] rounded-logo" : size === "md" ? "size-16 rounded-btn" : size === "sm" ? "size-10 rounded-btn" : "aspect-square w-full rounded-card";
  const inner = size === "card" ? "w-[42%]" : "w-[58%]";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden ${dims} ${className}`} style={{ background: bg }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className={`${inner} aspect-square rounded-[18%] object-contain`} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className={`font-bold tracking-[-0.04em] ${size === "card" ? "text-[44px]" : size === "lg" ? "text-[34px]" : "text-[16px]"} ${isLight(bg) ? "text-ink" : "text-white"}`}>{initials}</span>
      )}
    </div>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-[18px] ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CtaBlock({ title, body, centered = false }: { title: string; body?: string; centered?: boolean }) {
  return (
    <Section>
      <Container className={centered ? "text-center" : ""}>
        <h2 className="t-cta text-ink">{title}</h2>
        {body ? <p className={`t-sub mt-4 max-w-[380px] text-muted-5 ${centered ? "mx-auto" : ""}`}>{body}</p> : null}
        <div className={`mt-6 ${centered ? "flex justify-center" : ""}`}>
          <Button href="/submit">Submit work</Button>
        </div>
      </Container>
    </Section>
  );
}
