import type { Metadata } from "next";
import { Container, CtaBlock, Section } from "@/components/ui";

export const metadata: Metadata = { title: "About", description: "How DesignWell finds and publishes design work." };

export default function AboutPage() {
  return (
    <>
      <Section className="lg:!pt-20">
        <Container width="narrow">
          <h1 className="t-hero-sm text-ink">About DesignWell</h1>
          <div className="mt-8 space-y-5 text-[16px] leading-[1.5] font-medium text-ink-body">
            <p>
              DesignWell is a place to discover great design work that is happening inside companies. Follow the work to the company doing it, and the company to the design roles open
              there.
            </p>
            <p>
              Entries are found automatically across design publications, newsletters, company blogs, talks and launches. Each one is read in full, checked against a quality bar
              and published with a short original summary and a link to the source. We never reproduce articles.
            </p>
            <p>Spotted a mistake, or want something removed? Email the editor and we'll fix it quickly.</p>
          </div>
          <h2 id="crawler" className="t-section mt-14 scroll-mt-6 text-ink">
            DesignWellBot
          </h2>
          <div className="mt-4 space-y-4 text-[14px] leading-[1.5] font-medium text-ink-body">
            <p>
              Our crawler identifies itself as <code className="rounded bg-surface-card px-1.5 py-0.5">DesignWellBot</code>. It respects robots.txt (including Crawl-delay), fetches
              slowly, only reads public pages, and never logs in or reads LinkedIn or X.
            </p>
            <p>
              To opt out, add <code className="rounded bg-surface-card px-1.5 py-0.5">User-agent: DesignWellBot</code> and <code className="rounded bg-surface-card px-1.5 py-0.5">Disallow: /</code> to your
              robots.txt.
            </p>
          </div>
        </Container>
      </Section>
      <CtaBlock title="Contribute to DesignWell" centered />
    </>
  );
}
