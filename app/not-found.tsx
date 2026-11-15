import { Button, Container, Section } from "@/components/ui";

export default function NotFound() {
  return (
    <Section className="lg:!py-32">
      <Container>
        <h1 className="t-hero-sm text-ink">Nothing here</h1>
        <p className="t-sub mt-5">This page may have been unpublished or moved.</p>
        <div className="mt-8">
          <Button href="/">Browse the latest work</Button>
        </div>
      </Container>
    </Section>
  );
}
