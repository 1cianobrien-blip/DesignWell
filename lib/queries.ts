// Read-side queries for the public site. Only published entries and visible companies are exposed.
import { sql } from "./db";

export type EntryRow = {
  id: string;
  slug: string;
  title: string;
  type: string;
  source_url: string;
  source_platform: string | null;
  published_at: Date | null;
  created_at: Date;
  thumbnail_url: string | null;
  summary: string;
  tags: string[];
  featured: boolean;
  embed_html: string | null;
  company_id: string;
  company_slug: string;
  company_name: string;
  company_logo: string | null;
  company_color: string | null;
};

export type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  website: string | null;
  one_liner: string | null;
  careers_url: string | null;
  entry_count: number;
  open_roles: number;
  latest_at: Date | null;
};

export type JobRow = {
  id: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string;
  department: string | null;
  posted_at: Date | null;
  company_slug: string;
  company_name: string;
  company_logo: string | null;
  company_color: string | null;
};

const ENTRY_COLS = sql`
  e.id, e.slug, e.title, e.type, e.source_url, e.source_platform, e.published_at, e.created_at, e.thumbnail_url,
  e.summary, e.tags, e.featured, e.embed_html, e.company_id,
  c.slug as company_slug, c.name as company_name, c.logo_url as company_logo, c.brand_color as company_color`;

const VISIBLE = sql`e.status = 'published' and not c.hidden and not c.blocked`;

export async function listEntries(opts: { type?: string; tag?: string; limit?: number; offset?: number } = {}) {
  return sql<EntryRow[]>`
    select ${ENTRY_COLS} from entries e join companies c on c.id = e.company_id
    where ${VISIBLE}
      ${opts.type ? sql`and e.type = ${opts.type}` : sql``}
      ${opts.tag ? sql`and ${opts.tag} = any(e.tags)` : sql``}
    order by e.featured desc, coalesce(e.published_at, e.created_at) desc
    limit ${opts.limit ?? 24} offset ${opts.offset ?? 0}`;
}

export async function countEntries(opts: { type?: string; tag?: string } = {}) {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from entries e join companies c on c.id = e.company_id
    where ${VISIBLE}
      ${opts.type ? sql`and e.type = ${opts.type}` : sql``}
      ${opts.tag ? sql`and ${opts.tag} = any(e.tags)` : sql``}`;
  return r.n;
}

export async function tagCounts() {
  return sql<{ tag: string; n: number }[]>`
    select t as tag, count(*)::int as n from entries e join companies c on c.id = e.company_id, unnest(e.tags) t
    where ${VISIBLE} group by t order by n desc, t`;
}

export async function getEntry(slug: string) {
  const [r] = await sql<EntryRow[]>`select ${ENTRY_COLS} from entries e join companies c on c.id = e.company_id where e.slug = ${slug} and ${VISIBLE}`;
  return r ?? null;
}

export async function entriesForCompany(companyId: string, excludeId?: string) {
  return sql<EntryRow[]>`
    select ${ENTRY_COLS} from entries e join companies c on c.id = e.company_id
    where e.company_id = ${companyId} and ${VISIBLE} ${excludeId ? sql`and e.id <> ${excludeId}` : sql``}
    order by coalesce(e.published_at, e.created_at) desc`;
}

const COMPANY_COLS = sql`
  c.id, c.slug, c.name, c.logo_url, c.brand_color, c.website, c.one_liner, c.careers_url,
  (select count(*)::int from entries e where e.company_id = c.id and e.status = 'published') as entry_count,
  (select count(*)::int from jobs j where j.company_id = c.id and j.active) as open_roles,
  (select max(coalesce(e.published_at, e.created_at)) from entries e where e.company_id = c.id and e.status = 'published') as latest_at`;

const COMPANY_VISIBLE = sql`not c.hidden and not c.blocked and exists (select 1 from entries e where e.company_id = c.id and e.status = 'published')`;

export async function listCompanies(opts: { limit?: number; excludeId?: string; hiringOnly?: boolean } = {}) {
  return sql<CompanyRow[]>`
    select ${COMPANY_COLS} from companies c
    where ${COMPANY_VISIBLE} ${opts.excludeId ? sql`and c.id <> ${opts.excludeId}` : sql``}
      ${opts.hiringOnly ? sql`and exists (select 1 from jobs j where j.company_id = c.id and j.active)` : sql``}
    order by latest_at desc nulls last
    limit ${opts.limit ?? 500}`;
}

export async function getCompany(slug: string) {
  const [r] = await sql<CompanyRow[]>`select ${COMPANY_COLS} from companies c where c.slug = ${slug} and ${COMPANY_VISIBLE}`;
  return r ?? null;
}

export async function listJobs(opts: { company?: string; location?: string; role?: string; limit?: number } = {}) {
  const roleFilter = opts.role ? ROLE_FILTERS[opts.role] : undefined;
  return sql<JobRow[]>`
    select j.id, j.title, j.location, j.remote, j.url, j.department, j.posted_at,
           c.slug as company_slug, c.name as company_name, c.logo_url as company_logo, c.brand_color as company_color
    from jobs j join companies c on c.id = j.company_id
    where j.active and ${COMPANY_VISIBLE}
      ${opts.company ? sql`and c.slug = ${opts.company}` : sql``}
      ${opts.location === "remote" ? sql`and j.remote` : opts.location ? sql`and j.location ilike ${"%" + opts.location + "%"}` : sql``}
      ${roleFilter ? sql`and j.title ~* ${roleFilter}` : sql``}
    order by j.posted_at desc nulls last, j.first_seen_at desc
    limit ${opts.limit ?? 300}`;
}

export const ROLE_TYPES: Record<string, string> = {
  product: "Product design",
  ux: "UX and research",
  brand: "Brand and visual",
  systems: "Design systems",
  engineering: "Design engineering",
  leadership: "Leadership",
  content: "Content design",
};

const ROLE_FILTERS: Record<string, string> = {
  product: "product design",
  ux: "\\m(ux|user experience|research)",
  brand: "\\m(brand|visual|graphic|illustrat|motion|creative|art director)",
  systems: "design system",
  engineering: "design engineer|design technologist|ui engineer|front.?end.*design",
  leadership: "\\m(head of|director|vp|vice president|manager|lead|principal|chief)",
  content: "content design|ux writ",
};

export async function jobLocations() {
  const rows = await sql<{ location: string }[]>`
    select distinct trim(split_part(j.location, ',', -1)) as location from jobs j join companies c on c.id = j.company_id
    where j.active and j.location is not null and ${COMPANY_VISIBLE} order by 1`;
  return rows.map((r) => r.location).filter((l) => l && !/remote/i.test(l));
}

export async function jobsForCompany(companyId: string) {
  return sql<JobRow[]>`
    select j.id, j.title, j.location, j.remote, j.url, j.department, j.posted_at,
           c.slug as company_slug, c.name as company_name, c.logo_url as company_logo, c.brand_color as company_color
    from jobs j join companies c on c.id = j.company_id
    where j.company_id = ${companyId} and j.active order by j.posted_at desc nulls last`;
}

export async function siteStats() {
  const [r] = await sql<{ entries: number; companies: number; jobs: number }[]>`
    select
      (select count(*)::int from entries e join companies c on c.id = e.company_id where ${VISIBLE}) as entries,
      (select count(*)::int from companies c where ${COMPANY_VISIBLE}) as companies,
      (select count(*)::int from jobs j join companies c on c.id = j.company_id where j.active and ${COMPANY_VISIBLE}) as jobs`;
  return r;
}
