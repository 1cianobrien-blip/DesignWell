import { Container, Section } from "@/components/ui";
import { LoginForm } from "./form";

export const metadata = { title: "Admin sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <Section className="lg:!pt-24">
      <Container width="jobs">
        <h1 className="t-hero-sm text-ink">Admin</h1>
        <p className="t-sub mt-4">We'll email you a sign-in link. Only owner addresses can sign in.</p>
        <LoginForm initialError={error ? "That link didn't work, or this email isn't an admin." : null} />
      </Container>
    </Section>
  );
}
