import type { Metadata } from "next";
import { JobRowItem } from "@/components/cards";
import { JobFilters } from "@/components/job-filters";
import { Container, Notice, Section } from "@/components/ui";
import { jobLocations, listCompanies, listJobs, ROLE_TYPES } from "@/lib/queries";

export const revalidate = 900;
export const metadata: Metadata = {
  title: "Design jobs",
  description: "Open design roles at companies whose design work is published on DesignWell.",
};

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ company?: string; location?: string; role?: string }> }) {
  const sp = await searchParams;
  const role = sp.role && sp.role in ROLE_TYPES ? sp.role : undefined;
  const [jobs, companies, locations] = await Promise.all([
    listJobs({ company: sp.company, location: sp.location, role }),
    listCompanies({ hiringOnly: true }),
    jobLocations(),
  ]);
  return (
    <Section className="lg:!pt-20">
      <Container width="jobs">
        <h1 className="t-hero-sm text-ink">Work where design actually matters</h1>
        <p className="t-sub mt-6 max-w-[510px]">Open design roles at companies whose design work we've published. See the work first, then apply.</p>
        <p className="mt-14 mb-3.5 text-[14px] font-medium text-[#6e6e6e]">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} found
        </p>
        <JobFilters
          companies={companies.map((c) => ({ value: c.slug, label: c.name }))}
          locations={locations}
          roles={Object.entries(ROLE_TYPES).map(([value, label]) => ({ value, label }))}
          current={{ company: sp.company, location: sp.location, role }}
        />
        <div className="mt-4">
          {jobs.length ? jobs.map((j) => <JobRowItem key={j.id} j={j} />) : <Notice>No roles match those filters right now.</Notice>}
        </div>
      </Container>
    </Section>
  );
}
