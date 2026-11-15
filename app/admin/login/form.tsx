"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [state, setState] = useState<{ tone: "error" | "success"; msg: string } | null>(initialError ? { tone: "error", msg: initialError } : null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin/auth/callback`, shouldCreateUser: false },
    });
    setPending(false);
    setState(error ? { tone: "error", msg: error.message } : { tone: "success", msg: "Check your inbox for the sign-in link." });
  }
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <input
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="h-11 w-full rounded-field border border-field-border px-3.5 text-[14px] font-medium"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </Button>
      {state ? <Notice tone={state.tone}>{state.msg}</Notice> : null}
    </form>
  );
}
