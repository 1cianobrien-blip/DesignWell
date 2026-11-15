// Queries for the owner dashboard.
import { sql } from "./db";

export type DayRow = { day: string; found: number; published: number; review: number; rejected: number; discarded: number; other: number; pending: number };

/** Outcome of the candidates found each day (cohort view: "of what we found on day X, what happened"). */
export async function candidatesByDay(days = 30) {
  return sql<DayRow[]>`
    with d as (select generate_series((now() at time zone 'utc')::date - ${days - 1}::int, (now() at time zone 'utc')::date, '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(c.id)::int as found,
      count(*) filter (where c.outcome = 'published')::int as published,
      count(*) filter (where c.outcome = 'review')::int as review,
      count(*) filter (where c.outcome = 'rejected')::int as rejected,
      count(*) filter (where c.outcome = 'discarded')::int as discarded,
      count(*) filter (where c.outcome in ('duplicate','error','blocked','skipped'))::int as other,
      count(*) filter (where c.outcome = 'pending')::int as pending
    from d left join candidates c on (c.created_at at time zone 'utc')::date = d.day
    group by d.day order by d.day`;
}

export async function costByDay(days = 30) {
  return sql<{ day: string; cost: number; calls: number; triage: number; draft: number; search: number; other: number }[]>`
    with d as (select generate_series((now() at time zone 'utc')::date - ${days - 1}::int, (now() at time zone 'utc')::date, '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(l.cost), 0)::float as cost,
      count(l.id)::int as calls,
      coalesce(sum(l.cost) filter (where l.purpose = 'triage'), 0)::float as triage,
      coalesce(sum(l.cost) filter (where l.purpose in ('draft','fetch')), 0)::float as draft,
      coalesce(sum(l.cost) filter (where l.purpose = 'search'), 0)::float as search,
      coalesce(sum(l.cost) filter (where l.purpose not in ('triage','draft','fetch','search')), 0)::float as other
    from d left join llm_calls l on (l.created_at at time zone 'utc')::date = d.day
    group by d.day order by d.day`;
}

export async function headline() {
  const [r] = await sql<
    {
      published_7d: number;
      published_prev_7d: number;
      found_7d: number;
      review_queue: number;
      sources_active: number;
      sources_paused: number;
      companies: number;
      open_roles: number;
      median_age_days: number | null;
      cost_7d: number;
      last_run_at: Date | null;
      last_run_status: string | null;
    }[]
  >`
    select
      (select count(*)::int from entries where status = 'published' and created_at > now() - interval '7 days') as published_7d,
      (select count(*)::int from entries where status = 'published' and created_at between now() - interval '14 days' and now() - interval '7 days') as published_prev_7d,
      (select count(*)::int from candidates where created_at > now() - interval '7 days') as found_7d,
      (select count(*)::int from entries where status = 'review') as review_queue,
      (select count(*)::int from sources where status = 'active') as sources_active,
      (select count(*)::int from sources where status <> 'active') as sources_paused,
      (select count(*)::int from companies c where exists (select 1 from entries e where e.company_id = c.id and e.status = 'published')) as companies,
      (select count(*)::int from jobs where active) as open_roles,
      (select percentile_cont(0.5) within group (order by extract(epoch from (created_at - published_at)) / 86400)::float
         from entries where status = 'published' and published_at is not null and created_at > now() - interval '14 days') as median_age_days,
      (select coalesce(sum(cost), 0)::float from llm_calls where created_at > now() - interval '7 days') as cost_7d,
      (select max(started_at) from agent_runs where job_type = 'pipeline') as last_run_at,
      (select coalesce(stopped_reason, case when jsonb_array_length(errors) > 0 then 'errors' else 'ok' end)
         from agent_runs where job_type = 'pipeline' order by started_at desc limit 1) as last_run_status`;
  return r;
}

export async function topSources(limit = 15) {
  return sql<{ id: string; name: string | null; type: string; url_or_query: string; status: string; candidates_count: number; published_count: number; rejected_count: number; last_checked_at: Date | null; last_error: string | null; paused_reason: string | null; company_name: string | null }[]>`
    select s.*, c.name as company_name from sources s left join companies c on c.id = s.company_id
    order by s.published_count desc, s.candidates_count desc limit ${limit}`;
}

export async function allSources() {
  return sql<{ id: string; name: string | null; type: string; url_or_query: string; status: string; candidates_count: number; published_count: number; rejected_count: number; last_checked_at: Date | null; last_error: string | null; paused_reason: string | null; company_name: string | null }[]>`
    select s.*, c.name as company_name from sources s left join companies c on c.id = s.company_id
    order by s.status, s.type, s.published_count desc, s.name`;
}

export type AdminEntry = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  source_url: string;
  summary: string;
  thumbnail_url: string | null;
  quality_score: number;
  quality_reasons: { rubric?: Record<string, { rating: number; note: string }>; caps?: string[]; red_flags?: string[]; recency?: { rating: number; note: string } };
  featured: boolean;
  origin: string;
  created_at: Date;
  published_at: Date | null;
  review_expires_at: Date | null;
  company_id: string;
  company_name: string;
  company_slug: string;
  source_name: string | null;
};

export async function entriesByStatus(status: string, limit = 50) {
  return sql<AdminEntry[]>`
    select e.id, e.slug, e.title, e.type, e.status, e.source_url, e.summary, e.thumbnail_url, e.quality_score, e.quality_reasons, e.featured, e.origin,
           e.created_at, e.published_at, e.review_expires_at, e.company_id, c.name as company_name, c.slug as company_slug, s.name as source_name
    from entries e join companies c on c.id = e.company_id left join sources s on s.id = e.source_id
    where e.status = ${status}
    order by ${status === "review" ? sql`e.quality_score desc` : sql`e.created_at desc`}
    limit ${limit}`;
}

export async function recentCandidates(opts: { outcome?: string; limit?: number } = {}) {
  return sql<{ id: string; url: string; title: string | null; stage: string; outcome: string; reason: string | null; quality_score: number | null; created_at: Date; source_name: string | null; entry_id: string | null }[]>`
    select c.id, c.url, c.title, c.stage, c.outcome, c.reason, c.quality_score, c.created_at, s.name as source_name, c.entry_id
    from candidates c left join sources s on s.id = c.source_id
    ${opts.outcome ? sql`where c.outcome = ${opts.outcome}` : sql``}
    order by c.updated_at desc limit ${opts.limit ?? 100}`;
}

export async function recentRuns(limit = 12) {
  return sql<{ id: string; job_type: string; started_at: Date; finished_at: Date | null; items_in: number; items_published: number; tokens_used: string; cost_estimate: string; errors: { message: string; context?: string }[]; stopped_reason: string | null; stats: Record<string, number> }[]>`
    select * from agent_runs order by started_at desc limit ${limit}`;
}

export async function blockedDomains() {
  return sql<{ domain: string; reason: string | null; created_at: Date }[]>`select * from blocked_domains order by created_at desc`;
}

export async function submissionsRecent(limit = 30) {
  return sql<{ id: string; url: string; note: string | null; status: string; reason: string | null; created_at: Date }[]>`
    select id, url, note, status, reason, created_at from submissions order by created_at desc limit ${limit}`;
}
