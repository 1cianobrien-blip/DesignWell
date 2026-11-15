// Applies supabase/migrations/*.sql in order, tracking applied files in a table.
// Usage: DATABASE_URL=... npm run db:migrate   (or use `supabase db push` with the Supabase CLI)
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require", onnotice: () => {} });
const dir = path.resolve("supabase/migrations");

await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`;
const done = new Set((await sql`select name from _migrations`).map((r) => r.name as string));
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  console.log("applying", file);
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
    await tx`insert into _migrations (name) values (${file})`;
  });
}
console.log("migrations up to date");
await sql.end();
