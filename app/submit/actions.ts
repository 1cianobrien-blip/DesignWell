"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sql } from "@/lib/db";
import { canonicalUrl } from "@/lib/url";
import { addCandidate } from "@/pipeline/process";

export type SubmitState = { ok: boolean; message: string } | null;

const MAX_PER_DAY = 10;

function validUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    // No private/internal hosts.
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export async function submitUrl(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  if (String(form.get("website") ?? "")) return { ok: true, message: "Thanks!" }; // honeypot
  const url = validUrl(String(form.get("url") ?? ""));
  if (!url) return { ok: false, message: "That doesn't look like a public web address. Paste the full link, starting with https://" };
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(ip + (process.env.SUBMISSION_SALT ?? "dw")).digest("hex").slice(0, 32);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from submissions where ip_hash = ${ipHash} and created_at > now() - interval '1 day'`;
  if (n >= MAX_PER_DAY) return { ok: false, message: "You've hit today's submission limit. Thank you for sharing so much! Try again tomorrow." };

  const canonical = canonicalUrl(url.toString());
  const [existing] = await sql<{ slug: string; status: string }[]>`select slug, status from entries where source_url = ${canonical}`;
  if (existing?.status === "published") return { ok: true, message: "Already on DesignWell. Great minds!" };
  const [already] = await sql`select 1 from candidates where canonical_url = ${canonical}`;

  const [sub] = await sql<{ id: string }[]>`insert into submissions (url, note, ip_hash) values (${url.toString()}, ${note}, ${ipHash}) returning id`;
  if (already) {
    await sql`update submissions set status = 'rejected', reason = 'already seen by the pipeline' where id = ${sub.id}`;
    return { ok: true, message: "Thanks! We've already looked at this one." };
  }
  await addCandidate({ url: url.toString(), title: note, snippet: note, submissionId: sub.id });
  return { ok: true, message: "Thanks! It's in the queue. If it passes our quality checks it will appear on DesignWell within a few hours." };
}
