import Link from "next/link";
import { CardGrid, EntryCard, JobRowItem } from "@/components/cards";
import { ArrowRight, Button, Chip, Container, CtaBlock, Notice, Section, SectionHeader } from "@/components/ui";
import { countEntries, listEntries, listJobs, tagCounts } from "@/lib/queries";
import { ENTRY_TYPE_LABELS, ENTRY_TYPES } from "@/pipeline/taxonomy";

export const revalidate = 300;

const PAGE = 24;

function href(params: { type?: string; tag?: string; page?: number }) {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.tag) q.set("tag", params.tag);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `/?${s}#work` : "/#work";
}

export default async function Home({ searchParams }: { searchParams: Promise<{ type?: string; tag?: string; page?: string }> }) {
  const sp = await searchParams;
  const type = ENTRY_TYPES.includes(sp.type as never) ? sp.type : undefined;
  const tag = sp.tag?.slice(0, 40);
  const page = Math.max(1, Number(sp.page) || 1);
  const [entries, total, tags, jobs] = await Promise.all([
    listEntries({ type, tag, limit: PAGE, offset: (page - 1) * PAGE }),
    countEntries({ type, tag }),
    tagCounts(),
    listJobs({ limit: 5 }),
  ]);

  return (
    <>
      <Section className="!pt-14 !pb-14 lg:!pt-20 lg:!pb-16">
        <Container>
          <h1 className="t-hero max-w-[620px] text-ink">See the design work happening inside companies</h1>
          <p className="t-sub mt-5 max-w-[520px]">Case studies, rebrands, launches and talks from in-house design teams, found fresh every day.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button href="/submit">Submit work</Button>
            <Button href="/jobs" variant="secondary">
              View design jobs
            </Button>
          </div>
        </Container>
      </Section>

      <Section alt>
        <Container>
          <div id="work" className="scroll-mt-6" />
          <SectionHeader title="Latest design work from real teams" subtitle="Follow the work to the company, and the company to its open design roles" />
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip href={href({ tag })} active={!type}>
              All
            </Chip>
            {ENTRY_TYPES.map((t) => (
              <Chip key={t} href={href({ type: t, tag })} active={type === t}>
                {ENTRY_TYPE_LABELS[t]}
              </Chip>
            ))}
          </div>
          {tags.length ? (
            <div className="mb-8 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-medium text-muted-5">
              {tag ? (
                <Link href={href({ type })} className="text-brand">
                  × {tag}
                </Link>
              ) : null}
              {tags
                .filter((t) => t.tag !== tag)
                .slice(0, 14)
                .map((t) => (
                  <Link key={t.tag} href={href({ type, tag: t.tag })} scroll={false} className="hover:text-brand">
                    #{t.tag}
                  </Link>
                ))}
            </div>
          ) : (
            <div className="mb-8" />
          )}
          {entries.length ? (
            <CardGrid>
              {entries.map((e) => (
                <EntryCard key={e.id} e={e} />
              ))}
            </CardGrid>
          ) : (
            <Notice>{type || tag ? "Nothing matches that filter yet." : "The first entries are on their way. The pipeline publishes new work as it finds it."}</Notice>
          )}
          <div className="mt-10 flex items-center justify-between text-[14px] font-medium text-muted-5">
            <span>
              {total} {total === 1 ? "piece" : "pieces"} of work
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button href={href({ type, tag, page: page - 1 })} variant="secondary">
                  Newer
                </Button>
              ) : null}
              {page * PAGE < total ? (
                <Button href={href({ type, tag, page: page + 1 })} variant="secondary">
                  Older
                </Button>
              ) : null}
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeader title="Latest design roles at these companies" subtitle="Open roles, only at companies with published design work" />
          {jobs.length ? (
            <div>
              {jobs.map((j) => (
                <JobRowItem key={j.id} j={j} />
              ))}
            </div>
          ) : (
            <Notice>No open design roles right now. Check back soon.</Notice>
          )}
          <Link href="/jobs" className="mt-8 inline-flex items-center gap-2.5 text-[16px] leading-[19.2px] font-medium tracking-[-0.04em] text-ink hover:text-brand">
            View all jobs <ArrowRight />
          </Link>
        </Container>
      </Section>

      <Section alt>
        <Container>
          <SectionHeader title="How work gets on DesignWell" subtitle="Found automatically. Checked for quality. Linked back to the source." />
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
            {[
              ["01", "Found across the web", "We watch design publications, newsletters, company blogs, talks and launches for new work by in-house teams."],
              ["02", "Read and checked", "Each piece is read in full and scored on craft, real decisions and usefulness to working designers. Thin announcements don't make it."],
              ["03", "Linked to the team", "Published work links to the company behind it, its design track record and its open design roles."],
            ].map(([n, title, body]) => (
              <div key={n}>
                <p className="text-[24px] leading-[28.8px] font-extrabold tracking-[-0.04em] text-faint">{n}</p>
                <h3 className="mt-2 text-[16px] leading-[19.2px] font-bold text-ink">{title}</h3>
                <p className="mt-3 max-w-[260px] text-[14px] leading-[16.8px] font-medium text-muted-5">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <CtaBlock title="Seen great design work inside a company?" body="Share a case study, launch or talk. It goes through the same checks as everything else." />
    </>
  );
}
