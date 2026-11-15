import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardGrid, Dot, EntryCard } from "@/components/cards";
import { Button, Container, CtaBlock, ExternalIcon, LogoTile, Pill, Section } from "@/components/ui";
import { hostLabel, monthYear, plural, tileColor, typeLabel } from "@/lib/format";
import { entriesForCompany, getCompany, getEntry } from "@/lib/queries";

export const revalidate = 600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getEntry((await params).slug);
  if (!e) return {};
  return {
    title: `${e.title} · ${e.company_name}`,
    description: e.summary,
    openGraph: { title: e.title, description: e.summary, images: e.thumbnail_url ? [e.thumbnail_url] : undefined, type: "article" },
    alternates: { canonical: `/work/${e.slug}` },
  };
}

function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed${u.pathname}`;
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname.match(/^\/\d+/)![0]}`;
  } catch {
    /* not a URL */
  }
  return null;
}

export default async function EntryPage({ params }: Props) {
  const e = await getEntry((await params).slug);
  if (!e) notFound();
  const [company, more] = await Promise.all([getCompany(e.company_slug), entriesForCompany(e.company_id, e.id)]);
  const embed = videoEmbed(e.source_url);
  const host = hostLabel(e.source_url);

  return (
    <>
      <Section className="!pb-10">
        <Container width="narrow">
          <Link href={`/companies/${e.company_slug}`} className="inline-flex items-center gap-3">
            <LogoTile name={e.company_name} logo={e.company_logo} color={e.company_color} size="sm" />
            <span className="text-[16px] font-bold text-ink-body hover:text-brand">{e.company_name}</span>
          </Link>
          <h1 className="t-hero-sm mt-6 text-ink">{e.title}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 text-[16px] leading-[19.2px] font-medium tracking-[0.02em] text-muted-4">
            <span>{typeLabel(e.type)}</span>
            <Dot />
            <span>{monthYear(e.published_at ?? e.created_at)}</span>
            <Dot />
            <span>{host}</span>
          </p>

          <div className="mt-8 overflow-hidden rounded-card" style={{ background: tileColor(e.company_name, e.company_color) }}>
            {embed ? (
              <div className="aspect-video w-full">
                <iframe src={embed} title={e.title} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" />
              </div>
            ) : e.thumbnail_url ? (
              <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.thumbnail_url} alt={`Preview of ${e.title}`} referrerPolicy="no-referrer" className="block max-h-[560px] w-full object-cover" />
                <div className="absolute top-4 left-4">
                  <Pill>{typeLabel(e.type)}</Pill>
                </div>
              </a>
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center text-[22px] font-bold tracking-[-0.03em] text-white mix-blend-difference">{e.company_name}</div>
            )}
          </div>

          <p className="mt-8 text-[18px] leading-[1.4] font-medium tracking-[0.01em] text-ink-body lg:text-[20px]">{e.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button href={e.source_url} external>
              Read on {host} <ExternalIcon className="size-3.5" />
            </Button>
            {e.tags.map((t) => (
              <Link key={t} href={`/?tag=${encodeURIComponent(t)}#work`} className="text-[13px] font-medium text-muted-5 hover:text-brand">
                #{t}
              </Link>
            ))}
          </div>

          {company ? (
            <div className="mt-14 rounded-card bg-surface-card p-6 lg:p-8">
              <p className="t-eyebrow">The team behind it</p>
              <div className="mt-4 flex items-start gap-4">
                <LogoTile name={company.name} logo={company.logo_url} color={company.brand_color} size="md" />
                <div className="min-w-0 flex-1">
                  <Link href={`/companies/${company.slug}`} className="text-[20px] leading-[24px] font-bold text-ink-body hover:text-brand">
                    {company.name}
                  </Link>
                  {company.open_roles > 0 ? (
                    <p className="mt-1 flex items-center gap-1.5 text-[14px] font-medium text-success">
                      <span className="size-2 rounded-full bg-success" /> Hiring designers
                    </p>
                  ) : null}
                  {company.one_liner ? <p className="mt-2 text-[14px] leading-[1.35] font-medium text-ink-body">{company.one_liner}</p> : null}
                  <p className="mt-3 text-[14px] font-medium text-muted-4">
                    {plural(company.entry_count, "piece")} of work on DesignWell
                    {company.open_roles > 0 ? ` · ${plural(company.open_roles, "open design role")}` : ""}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button href={`/companies/${company.slug}`}>See their design work</Button>
                    {company.open_roles > 0 ? (
                      <Button href={`/jobs?company=${company.slug}`} variant="secondary">
                        View open roles
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </Container>
      </Section>

      {more.length ? (
        <Section alt>
          <Container>
            <h2 className="t-section mb-8 text-ink">More from {e.company_name}</h2>
            <CardGrid>
              {more.slice(0, 4).map((m) => (
                <EntryCard key={m.id} e={m} showCompany={false} />
              ))}
            </CardGrid>
          </Container>
        </Section>
      ) : null}

      <CtaBlock title="Contribute to DesignWell" centered />
    </>
  );
}
