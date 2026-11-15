import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobRowItem } from "@/components/cards";
import { Container, CtaBlock, ExternalIcon, LogoTile, Notice, Section } from "@/components/ui";
import { hostLabel, plural, shortDate, typeLabel } from "@/lib/format";
import { entriesForCompany, getCompany, jobsForCompany, listCompanies, type EntryRow } from "@/lib/queries";

export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCompany((await params).slug);
  if (!c) return {};
  const description = `${c.name}'s design track record: ${plural(c.entry_count, "piece")} of work${c.open_roles ? ` and ${plural(c.open_roles, "open design role")}` : ""}.`;
  return { title: `${c.name} design`, description, openGraph: { title: `${c.name} on DesignWell`, description }, alternates: { canonical: `/companies/${c.slug}` } };
}

function byYear(entries: EntryRow[]) {
  const groups = new Map<number, EntryRow[]>();
  for (const e of entries) {
    const y = new Date(e.published_at ?? e.created_at).getUTCFullYear();
    groups.set(y, [...(groups.get(y) ?? []), e]);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]);
}

export default async function CompanyPage({ params }: Props) {
  const c = await getCompany((await params).slug);
  if (!c) notFound();
  const [entries, jobs, others] = await Promise.all([entriesForCompany(c.id), jobsForCompany(c.id), listCompanies({ limit: 4, excludeId: c.id })]);

  return (
    <>
      <section className="pt-10 pb-6 lg:pt-20">
        <Container width="narrow">
          <div className="flex items-center gap-4">
            <LogoTile name={c.name} logo={c.logo_url} color={c.brand_color} size="lg" />
            <div>
              <h1 className="flex items-center gap-2 text-[20px] leading-[24px] font-bold text-ink-body">
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-brand">
                    {c.name} <ExternalIcon />
                  </a>
                ) : (
                  c.name
                )}
              </h1>
              {c.open_roles > 0 ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-[16px] leading-[19.2px] font-medium text-success">
                  <span className="size-2 rounded-full bg-success" /> Actively hiring designers
                </p>
              ) : null}
            </div>
          </div>
          {c.one_liner ? <p className="mt-6 text-[16px] leading-[19.2px] font-medium tracking-[0.02em] text-ink-body">{c.one_liner}</p> : null}
          <p className="mt-4 text-[16px] leading-[19.2px] font-medium tracking-[0.02em] text-muted-4">
            {plural(c.entry_count, "piece")} of design work
            {c.open_roles > 0 ? ` • ${plural(c.open_roles, "open design role")}` : ""}
            {c.website ? ` • ${hostLabel(c.website)}` : ""}
          </p>

          <nav className="mt-8 flex gap-10 border-b border-line-2 text-[16px] leading-[19.2px]">
            <a href="#work" className="-mb-px border-b-2 border-ink pb-2 font-bold text-ink-body">
              Design work
            </a>
            <a href="#roles" className="pb-2 font-medium text-tab hover:text-ink-body">
              Open roles {jobs.length ? `(${jobs.length})` : ""}
            </a>
          </nav>
        </Container>
      </section>

      <section id="work" className="scroll-mt-6 pb-10">
        <Container width="narrow">
          {byYear(entries).map(([year, list]) => (
            <div key={year} className="mt-6">
              <p className="t-eyebrow mb-1">{year}</p>
              {list.map((e) => (
                <Link key={e.id} href={`/work/${e.slug}`} className="group flex gap-4 border-b border-line-2 py-5 lg:gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="t-eyebrow">
                      {typeLabel(e.type)} · {shortDate(e.published_at ?? e.created_at)}
                    </p>
                    <h2 className="mt-1 text-[16px] leading-[19.2px] font-bold tracking-[0.02em] text-ink-body group-hover:text-brand">{e.title}</h2>
                    <p className="mt-3 text-[14px] leading-[16.8px] font-medium tracking-[0.02em] text-ink-body">{e.summary}</p>
                  </div>
                  {e.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="hidden h-[92px] w-[136px] shrink-0 rounded-card object-cover sm:block" />
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </Container>
      </section>

      <section id="roles" className="scroll-mt-6 pb-10">
        <Container width="narrow">
          <h2 className="t-section mt-6 mb-4 text-ink">Open design roles</h2>
          {jobs.length ? (
            jobs.map((j) => <JobRowItem key={j.id} j={j} showCompany={false} />)
          ) : (
            <Notice>
              No open design roles right now.
              {c.careers_url ? (
                <>
                  {" "}
                  <a href={c.careers_url} target="_blank" rel="noopener noreferrer" className="text-brand">
                    Visit their careers page ↗
                  </a>
                </>
              ) : null}
            </Notice>
          )}
        </Container>
      </section>

      {others.length ? (
        <section className="py-10">
          <Container width="narrow">
            <div className="rounded-card bg-surface-card px-6 pt-6 pb-8">
              <p className="text-center text-[14px] leading-[16.8px] font-medium text-[#454545]">Other companies</p>
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {others.map((o) => (
                  <Link key={o.id} href={`/companies/${o.slug}`} className="flex items-center gap-2.5">
                    <LogoTile name={o.name} logo={o.logo_url} color={o.brand_color} size="md" />
                    <div className="min-w-0 text-[14px] leading-[22.4px] tracking-[-0.02em] text-muted-7">
                      <p className="truncate font-bold">{o.name}</p>
                      <p className="font-medium">{plural(o.entry_count, "piece")}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Container>
        </section>
      ) : null}

      <CtaBlock title="Contribute to DesignWell" centered />
    </>
  );
}
