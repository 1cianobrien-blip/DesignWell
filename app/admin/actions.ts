"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { hostOf, rootDomain } from "@/lib/url";

function refresh() {
  revalidatePath("/", "layout");
}

const id = (f: FormData, k = "id") => String(f.get(k) ?? "");

export async function setEntryStatus(form: FormData) {
  await requireAdmin();
  const status = id(form, "status");
  if (!["published", "unpublished", "rejected", "review"].includes(status)) return;
  await sql`update entries set status = ${status}::entry_status, reviewed_at = now(), review_expires_at = null where id = ${id(form)}`;
  // Keep the source scoring honest: an owner approval counts as published.
  if (status === "published") {
    await sql`update sources s set published_count = published_count + 1 from entries e where e.id = ${id(form)} and s.id = e.source_id`;
    await sql`update candidates set outcome = 'published' where entry_id = ${id(form)}`;
  } else if (status === "rejected") {
    await sql`update sources s set rejected_count = rejected_count + 1 from entries e where e.id = ${id(form)} and s.id = e.source_id`;
    await sql`update candidates set outcome = 'rejected', reason = 'rejected in review' where entry_id = ${id(form)}`;
  }
  refresh();
}

export async function toggleFeatured(form: FormData) {
  await requireAdmin();
  await sql`update entries set featured = not featured where id = ${id(form)}`;
  refresh();
}

/** One click: block a domain and unpublish everything from it. */
export async function blockDomain(form: FormData) {
  await requireAdmin();
  const raw = id(form, "domain") || id(form, "url");
  const domain = raw.includes("/") ? rootDomain(hostOf(raw) || raw) : rootDomain(raw);
  if (!domain || !domain.includes(".")) return;
  await sql`insert into blocked_domains (domain, reason) values (${domain}, ${String(form.get("reason") ?? "") || null}) on conflict do nothing`;
  await sql`update entries set status = 'unpublished', reviewed_at = now() where status in ('published','review') and (source_url ilike ${"%://" + domain + "/%"} or source_url ilike ${"%." + domain + "/%"})`;
  await sql`update sources set status = 'blocked', paused_reason = 'domain blocked' where url_or_query ilike ${"%" + domain + "%"} and type in ('rss','company_channel')`;
  refresh();
}

export async function unblockDomain(form: FormData) {
  await requireAdmin();
  await sql`delete from blocked_domains where domain = ${id(form, "domain")}`;
  refresh();
}

/** One click: block a company, hiding it and unpublishing its entries. */
export async function blockCompany(form: FormData) {
  await requireAdmin();
  await sql`update companies set blocked = true where id = ${id(form)}`;
  await sql`update entries set status = 'unpublished', reviewed_at = now() where company_id = ${id(form)} and status in ('published','review')`;
  await sql`update sources set status = 'blocked', paused_reason = 'company blocked' where company_id = ${id(form)}`;
  refresh();
}

export async function setSourceStatus(form: FormData) {
  await requireAdmin();
  const status = id(form, "status");
  if (!["active", "paused", "blocked"].includes(status)) return;
  await sql`update sources set status = ${status}::source_status, paused_reason = ${status === "active" ? null : "set by owner"} where id = ${id(form)}`;
  refresh();
}

export async function addSource(form: FormData) {
  await requireAdmin();
  const type = id(form, "type");
  const value = id(form, "value").trim();
  if (!["rss", "search_query", "api"].includes(type) || !value) return;
  await sql`insert into sources (type, name, url_or_query) values (${type}::source_type, ${id(form, "name") || value}, ${value}) on conflict do nothing`;
  refresh();
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const num = (k: string, min: number, max: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const publish = num("publish_threshold", 0, 100);
  const review = num("review_threshold", 0, 100);
  const cap = num("daily_spend_cap_usd", 0, 1000);
  const expiry = num("review_expiry_days", 1, 90);
  if (publish !== null) await setSetting("publish_threshold", publish);
  if (review !== null) await setSetting("review_threshold", Math.min(review, publish ?? 100));
  if (cap !== null) await setSetting("daily_spend_cap_usd", cap);
  if (expiry !== null) await setSetting("review_expiry_days", expiry);
  await setSetting("pipeline_enabled", form.get("pipeline_enabled") === "on");
  refresh();
}
