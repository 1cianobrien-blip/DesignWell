import type { Metadata } from "next";
import { Container, Section } from "@/components/ui";
import { SubmitForm } from "./form";

export const metadata: Metadata = {
  title: "Submit work",
  description: "Share a piece of design work from inside a company: a case study, rebrand, launch or talk.",
};

export default function SubmitPage() {
  return (
    <Section className="lg:!pt-20">
      <Container width="jobs">
        <h1 className="t-hero-sm text-ink">Share design work from inside a company</h1>
        <p className="t-sub mt-6 max-w-[540px]">
          A case study, rebrand, launch write-up, design system post or talk. Paste the link and we'll read it, check it against our quality bar and credit the team behind it.
        </p>
        <SubmitForm />
        <div className="mt-14 grid gap-6 text-[14px] leading-[1.4] font-medium text-muted-5 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-[16px] font-bold text-ink">What works well</h2>
            <p>Real work from a real company that shows decisions, trade-offs or craft. In-house team write-ups and agency case studies for a named client are both welcome.</p>
          </div>
          <div>
            <h2 className="mb-2 text-[16px] font-bold text-ink">What doesn't</h2>
            <p>Generic advice, listicles, tool promotion, concept redesigns and job ads. LinkedIn and X posts are reviewed by hand, so they take longer.</p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
