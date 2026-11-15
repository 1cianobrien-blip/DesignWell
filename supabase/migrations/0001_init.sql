-- DesignWell initial schema
-- Applies cleanly to Supabase Postgres. Public pages read through RLS-safe views/policies;
-- the pipeline and the server-side app connect with the service connection string.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type source_type     as enum ('rss', 'search_query', 'api', 'company_channel');
create type source_status   as enum ('active', 'paused', 'blocked');
create type ats_provider    as enum ('greenhouse', 'lever', 'ashby');
create type created_by_kind as enum ('pipeline', 'manual');
create type entry_type      as enum ('case_study', 'launch', 'brand', 'talk', 'process', 'post');
create type entry_status    as enum ('published', 'review', 'rejected', 'unpublished');
create type entry_origin    as enum ('pipeline', 'submission', 'manual');
create type candidate_stage as enum ('collected', 'triage', 'draft', 'resolve', 'gate', 'validate', 'done');
create type candidate_outcome as enum ('pending', 'published', 'review', 'rejected', 'discarded', 'duplicate', 'error', 'blocked', 'skipped');
create type submission_status as enum ('pending', 'processing', 'published', 'review', 'rejected', 'error');

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table companies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  logo_url        text,
  brand_color     text,                       -- hex, used for the card tile background
  website         text,
  domain          citext unique,              -- normalised host of website, used for matching
  one_liner       text,
  careers_url     text,
  ats_provider    ats_provider,
  ats_board_token text,
  created_by      created_by_kind not null default 'pipeline',
  hidden          boolean not null default false,
  blocked         boolean not null default false,
  research_done_at timestamptz,               -- snowball expansion completed
  jobs_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);
create index companies_name_lower on companies (lower(name));

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------
create table sources (
  id               uuid primary key default gen_random_uuid(),
  type             source_type not null,
  name             text,
  url_or_query     text not null,
  company_id       uuid references companies(id) on delete set null,
  status           source_status not null default 'active',
  candidates_count integer not null default 0,
  published_count  integer not null default 0,
  rejected_count   integer not null default 0,
  last_checked_at  timestamptz,
  last_error       text,
  paused_reason    text,
  created_at       timestamptz not null default now(),
  unique (type, url_or_query)
);

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------
create table entries (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  company_id      uuid not null references companies(id) on delete cascade,
  type            entry_type not null,
  source_url      text not null unique,       -- canonical
  source_platform text,                       -- e.g. medium, substack, youtube, company_blog
  source_id       uuid references sources(id) on delete set null,
  published_at    timestamptz,
  thumbnail_url   text,
  summary         text not null,
  tags            text[] not null default '{}',
  quality_score   integer not null check (quality_score between 0 and 100),
  quality_reasons jsonb not null default '{}'::jsonb,
  status          entry_status not null,
  featured        boolean not null default false,
  origin          entry_origin not null default 'pipeline',
  embed_html      text,                       -- optional sanitised oEmbed (YouTube/Vimeo/X)
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  review_expires_at timestamptz
);
create index entries_status_published on entries (status, featured desc, published_at desc nulls last);
create index entries_company on entries (company_id, published_at desc);
create index entries_tags on entries using gin (tags);

-- ---------------------------------------------------------------------------
-- Candidates: every collected item, with stage/outcome/reason (experiment log)
-- ---------------------------------------------------------------------------
create table candidates (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references sources(id) on delete set null,
  submission_id uuid,
  url           text not null,
  canonical_url text not null,
  title         text,
  snippet       text,
  stage         candidate_stage not null default 'collected',
  outcome       candidate_outcome not null default 'pending',
  reason        text,
  triage        jsonb,
  draft         jsonb,
  quality_score integer,
  entry_id      uuid references entries(id) on delete set null,
  run_id        uuid,
  attempts      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (canonical_url)
);
create index candidates_pending on candidates (outcome, created_at) where outcome = 'pending';
create index candidates_created on candidates (created_at);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table jobs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  title       text not null,
  location    text,
  remote      boolean not null default false,
  url         text not null,
  department  text,
  posted_at   timestamptz,
  external_id text not null,
  active      boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (company_id, external_id)
);
create index jobs_active on jobs (active, posted_at desc nulls last);

-- ---------------------------------------------------------------------------
-- Agent runs (cost and throughput log)
-- ---------------------------------------------------------------------------
create table agent_runs (
  id              uuid primary key default gen_random_uuid(),
  job_type        text not null,             -- collect | process | jobs_sync | snowball | seed | submissions | maintenance
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  items_in        integer not null default 0,
  items_published integer not null default 0,
  tokens_used     bigint not null default 0,
  cost_estimate   numeric(10,4) not null default 0,
  errors          jsonb not null default '[]'::jsonb,
  stopped_reason  text,                      -- e.g. 'spend_cap'
  stats           jsonb not null default '{}'::jsonb
);
create index agent_runs_started on agent_runs (started_at desc);

-- Per-call LLM usage, so the daily spend cap can be enforced precisely.
create table llm_calls (
  id            bigserial primary key,
  run_id        uuid references agent_runs(id) on delete set null,
  purpose       text not null,               -- triage | draft | resolve | snowball | search
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  server_tool_uses integer not null default 0,
  cost          numeric(10,5) not null default 0,
  created_at    timestamptz not null default now()
);
create index llm_calls_created on llm_calls (created_at);

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------
create table submissions (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  note       text,
  status     submission_status not null default 'pending',
  reason     text,
  entry_id   uuid references entries(id) on delete set null,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index submissions_status on submissions (status, created_at);
alter table candidates add constraint candidates_submission_fk foreign key (submission_id) references submissions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Owner controls
-- ---------------------------------------------------------------------------
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values
  ('publish_threshold', '75'),     -- score >= this auto-publishes (conservative start)
  ('review_threshold',  '55'),     -- score in [review, publish) goes to review queue
  ('daily_spend_cap_usd', '5'),
  ('review_expiry_days', '14'),
  ('source_pause_min_candidates', '15'),
  ('source_pause_max_reject_rate', '0.9'),
  ('pipeline_enabled', 'true');

create table blocked_domains (
  domain     citext primary key,
  reason     text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Public read surface
-- ---------------------------------------------------------------------------
-- Companies are only public when they have at least one published entry.
create view public_companies as
  select c.*,
         (select count(*) from entries e where e.company_id = c.id and e.status = 'published')::int as entry_count,
         (select count(*) from jobs j where j.company_id = c.id and j.active)::int as open_roles
  from companies c
  where not c.hidden and not c.blocked
    and exists (select 1 from entries e where e.company_id = c.id and e.status = 'published');

-- Row level security: the anon/authenticated Supabase roles can only read public data.
-- The app server and pipeline use the privileged connection and bypass RLS.
alter table companies    enable row level security;
alter table entries      enable row level security;
alter table jobs         enable row level security;
alter table sources      enable row level security;
alter table candidates   enable row level security;
alter table agent_runs   enable row level security;
alter table llm_calls    enable row level security;
alter table submissions  enable row level security;
alter table settings     enable row level security;
alter table blocked_domains enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute $p$create policy "public entries" on entries for select to anon, authenticated using (status = 'published')$p$;
    execute $p$create policy "public companies" on companies for select to anon, authenticated using (not hidden and not blocked)$p$;
    execute $p$create policy "public jobs" on jobs for select to anon, authenticated using (active)$p$;
  end if;
end $$;
