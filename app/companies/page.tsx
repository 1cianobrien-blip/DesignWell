import type { Metadata } from "next";
import { CardGrid, CompanyCard } from "@/components/cards";
import { Container, CtaBlock, Notice, Section } from "@/components/ui";
import { listCompanies } from "@/lib/queries";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Companies",
  description: "Companies with published design work on DesignWell, and the design roles open there.",
};

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <>
      <Section className="!pb-10">
        <Container>
          <h1 className="t-hero-sm max-w-[620px] text-ink">Companies doing design work worth seeing</h1>
          <p className="t-sub mt-5 max-w-[520px]">Every company here has published design work on DesignWell. Explore their track record and open roles.</p>
        </Container>
      </Section>
      <Section alt className="!pt-12">
        <Container>
          <p className="mb-6 text-[14px] font-medium text-muted-6">{companies.length} companies</p>
          {companies.length ? (
            <CardGrid>
              {companies.map((c) => (
                <CompanyCard key={c.id} c={c} />
              ))}
            </CardGrid>
          ) : (
            <Notice>Companies appear here once their first piece of work is published.</Notice>
          )}
        </Container>
      </Section>
      <CtaBlock title="Know a team doing great design work?" body="Share a piece of their work. Companies appear here once their work is published." />
    </>
  );
}
