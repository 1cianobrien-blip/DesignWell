// Entry and company cards: entry cards extend the Framer company card (square-ish tile, pill, centred title + meta).
import Link from "next/link";
import { isLight, plural, shortDate, tileColor, typeLabel } from "@/lib/format";
import type { CompanyRow, EntryRow, JobRow } from "@/lib/queries";
import { LogoTile, Pill } from "./ui";

export function EntryCard({ e, showCompany = true }: { e: EntryRow; showCompany?: boolean }) {
  const bg = tileColor(e.company_name, e.company_color);
  return (
    <Link href={`/work/${e.slug}`} className="group block">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card" style={{ background: bg }}>
        {e.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={e.thumbnail_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center p-6 text-center text-[18px] leading-tight font-bold tracking-[-0.03em] ${isLight(bg) ? "text-ink" : "text-white"}`}>
            {e.company_name}
          </div>
        )}
        <div className="absolute top-3 left-3 lg:top-4 lg:left-4">
          <Pill>{typeLabel(e.type)}</Pill>
        </div>
      </div>
      <div className="mt-2 text-center">
        <h3 className="line-clamp-2 text-[15px] leading-[1.25] font-semibold text-ink lg:text-[16px]">{e.title}</h3>
        <p className="t-meta mt-1">
          {showCompany ? (
            <>
              {e.company_name} <Dot />{" "}
            </>
          ) : null}
          {shortDate(e.published_at ?? e.created_at)}
        </p>
      </div>
    </Link>
  );
}

export function Dot() {
  return <span className="mx-0.5 inline-block size-1 rounded-full bg-muted-3 align-middle" aria-hidden />;
}

export function CompanyCard({ c }: { c: CompanyRow }) {
  return (
    <Link href={`/companies/${c.slug}`} className="group block">
      <div className="relative">
        <LogoTile name={c.name} logo={c.logo_url} color={c.brand_color} />
        {c.open_roles > 0 ? (
          <div className="absolute top-3 left-3 lg:top-4 lg:left-4">
            <Pill>Hiring</Pill>
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-center">
        <h3 className="text-[16px] leading-[19.2px] font-semibold text-ink">{c.name}</h3>
        <p className="t-meta mt-1">
          {plural(c.entry_count, "piece")} of work
          {c.open_roles > 0 ? (
            <>
              {" "}
              <Dot /> {plural(c.open_roles, "design role")}
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-[14px] lg:gap-y-8">{children}</div>;
}

export function JobRowItem({ j, showCompany = true }: { j: JobRow; showCompany?: boolean }) {
  return (
    <a href={j.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 border-b border-line-2 py-4 last:border-b-0">
      {showCompany ? <LogoTile name={j.company_name} logo={j.company_logo} color={j.company_color} size="sm" /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] leading-[19.2px] font-bold text-ink-body group-hover:text-brand">{j.title}</p>
        <p className="t-meta mt-1 truncate">
          {showCompany ? (
            <>
              {j.company_name} <Dot />{" "}
            </>
          ) : null}
          {j.remote ? "Remote" : null}
          {j.remote && j.location && !/remote/i.test(j.location) ? " · " : null}
          {j.location && !(j.remote && /remote/i.test(j.location)) ? j.location : null}
          {j.posted_at ? (
            <>
              {" "}
              <Dot /> {shortDate(j.posted_at)}
            </>
          ) : null}
        </p>
      </div>
      <span className="hidden text-[14px] font-bold text-brand sm:inline">Apply ↗</span>
    </a>
  );
}
