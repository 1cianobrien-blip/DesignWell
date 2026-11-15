// Daily jobs sync: for companies with an ATS and published work, pull design roles only.
import { fetchAtsJobs, isDesignRole, type Ats } from "@/lib/ats";
import { sql } from "@/lib/db";
import { bump, recordError, type Run } from "./run";

export async function syncJobs(run: Run) {
  const companies = await sql<{ id: string; name: string; ats_provider: Ats["provider"]; ats_board_token: string }[]>`
    select c.id, c.name, c.ats_provider, c.ats_board_token from companies c
    where c.ats_provider is not null and c.ats_board_token is not null and not c.blocked
      and exists (select 1 from entries e where e.company_id = c.id and e.status = 'published')`;
  for (const c of companies) {
    run.itemsIn++;
    try {
      const all = await fetchAtsJobs({ provider: c.ats_provider, token: c.ats_board_token });
      if (all === null) throw new Error(`${c.ats_provider} board ${c.ats_board_token} unavailable`);
      const design = all.filter((j) => isDesignRole(j.title, j.department));
      const seen: string[] = [];
      for (const j of design) {
        seen.push(j.external_id);
        await sql`
          insert into jobs (company_id, title, location, remote, url, department, posted_at, external_id, active, last_seen_at)
          values (${c.id}, ${j.title}, ${j.location}, ${j.remote}, ${j.url}, ${j.department}, ${j.posted_at}, ${j.external_id}, true, now())
          on conflict (company_id, external_id) do update set
            title = excluded.title, location = excluded.location, remote = excluded.remote, url = excluded.url,
            department = excluded.department, posted_at = coalesce(excluded.posted_at, jobs.posted_at), active = true, last_seen_at = now()`;
      }
      // Anything not seen this time is closed.
      await sql`update jobs set active = false where company_id = ${c.id} and active and not (external_id = any(${seen}))`;
      await sql`update companies set jobs_synced_at = now() where id = ${c.id}`;
      bump(run, "design_roles", design.length);
      bump(run, "all_roles", all.length);
      console.log(`  ${c.name}: ${design.length} design roles of ${all.length}`);
    } catch (e) {
      recordError(run, e, c.name);
    }
  }
}
