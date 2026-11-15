# DesignWell

Discover great design work happening inside companies → the companies doing it → their open design roles.

The site runs itself: an autonomous pipeline finds design work across the web, works out which company it belongs to, writes a short entry, scores it and publishes it. The owner oversees it from `/admin`.

## Architecture

```
GitHub Actions (hourly)                          Vercel (Next.js App Router)
  pipeline run                                     /            feed (featured first, type + tag filters)
    collect   RSS/Atom, HN Algolia, web search     /work/[slug] entry → company card, roles
    triage    claude-haiku-5-5, batched            /companies   index; /companies/[slug] timeline + roles
    draft     claude-opus-5-5, structured output   /jobs        design roles at companies with work
    resolve   website, logo, one-liner, ATS        /submit      URL submissions → same pipeline
    validate  URL + thumbnail resolve, dedupe      /admin       dashboard, review, sources, settings
    gate      publish / review / reject
    maintain  auto-pause bad sources, expire reviews
GitHub Actions (daily)
  jobs        Greenhouse / Lever / Ashby → design roles only
  snowball    find each new company's own design channels
                         ↘          ↙
                     Supabase Postgres (+ Auth for /admin)
```

- `pipeline/` stage modules and the CLI (`npm run pipeline -- <command>`).
- `lib/` shared code: `db` (Postgres), `llm` (Claude wrapper with cost logging and the daily spending cap), `http` (polite crawler), `ats`, `queries`.
- `supabase/migrations/` schema. `design-reference/` Framer screenshots and extracted tokens.

### Quality score

The drafting model rates four criteria from 0 to 10, each with a note citing the source: real work, decisions shown, usefulness to designers, and substance. Code computes recency from the date and combines everything into a 0–100 score with weights 20/30/25/15/10, plus hard caps (not company work ≤ 20, not real work ≤ 40, thin content ≤ 50, red flags −5 each). Tune the weights in `pipeline/draft.ts → rubricScore` and the thresholds in `/admin/settings` (start: publish ≥ 75, review 55–74).

### Guardrails

- Crawler UA `DesignWellBot/1.0 (+SITE_URL/about#crawler)`. Honours robots.txt and Crawl-delay; one request per 1.5s per host.
- LinkedIn, X, Instagram, Facebook, Threads and TikTok are never fetched. Submissions from them go to the review queue.
- Entries hold a short original summary and a link. Article text is never stored or shown.
- `validate` requires a resolving source URL. Without a usable thumbnail, an entry can't auto-publish.
- Every Claude call is priced and logged in `llm_calls`. Before each call, the pipeline checks today's spend against the cap and stops the run when it's reached.
- Admin can unpublish, feature, and block a domain or a company in one click. Each block also unpublishes the related entries and blocks the related sources.

## Setup

1. **Supabase**: create a project. Apply the migrations with `DATABASE_URL=... npm run db:migrate` (or `supabase db push`). In Auth, enable email sign-in and add your site URL plus `/admin/auth/callback` to the redirect URLs. Create your admin user (Auth → Users → Invite), because sign-in doesn't create users.
2. **Vercel**: import the repo and set `DATABASE_URL` (transaction pooler URL), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`, `SITE_URL` and `SUBMISSION_SALT`.
3. **GitHub Actions**: add the secrets `DATABASE_URL` and `ANTHROPIC_API_KEY`, and the variable `SITE_URL`. The hourly `Pipeline` workflow seeds its own sources on the first run, verifying every feed before adding it.
4. **Tune before you let it run**: run the `Eval drafting agent` workflow (or `npm run pipeline -- eval`) over `pipeline/eval/urls.json`, check where scores land, then adjust the weights and thresholds.

### Local development

```bash
cp .env.example .env.local      # fill in DATABASE_URL at minimum
npm install
npm run db:migrate
npx tsx scripts/dev-fixtures.ts # fictional demo data, local databases only
ADMIN_DEV_BYPASS=1 npm run dev
npm run pipeline -- draft https://example.com/some-case-study
```

## First milestone

Let the pipeline run for two weeks, then review `/admin`. It shows items found, published, queued and rejected per day; median age of entries at publish (freshness); each source's hit rate; and cost per day. `/admin/candidates` explains every decision.
