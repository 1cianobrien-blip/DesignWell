"use client";

import { useActionState } from "react";
import { Button, Notice } from "@/components/ui";
import { submitUrl, type SubmitState } from "./actions";

const field = "w-full rounded-field border border-field-border bg-surface px-3.5 text-[14px] font-medium text-ink-body placeholder:text-muted-3";

export function SubmitForm() {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitUrl, null);
  return (
    <form action={action} className="mt-10 space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-body">Link to the work</span>
        <input name="url" type="url" required placeholder="https://" className={`${field} h-11`} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-body">
          Note <span className="font-medium text-muted-3">(optional)</span>
        </span>
        <textarea name="note" rows={3} maxLength={500} placeholder="Who's it by, and why is it worth seeing?" className={`${field} py-3`} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex items-center gap-4 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Submit work"}
        </Button>
      </div>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
    </form>
  );
}
