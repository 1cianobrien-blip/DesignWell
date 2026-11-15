// LOCAL DEVELOPMENT ONLY: fills a local database with fictional companies and entries so pages can be previewed.
// Refuses to run against any non-local DATABASE_URL.
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "@/lib/db";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("dev-fixtures only runs against a local database");
  process.exit(1);
}

const COMPANIES = [
  { name: "Northwind", color: "#E0482A", one: "Freight software for independent carriers" },
  { name: "Lumen Bank", color: "#1F63E8", one: "A current account for freelancers" },
  { name: "Fieldnote", color: "#D6FB52", one: "Shared notebooks for research teams" },
  { name: "Harbor", color: "#236CFF", one: "Payroll for small hospitality businesses" },
  { name: "Orbital", color: "#0B1A33", one: "Satellite imagery for farmers" },
  { name: "Pallet", color: "#635BFF", one: "Inventory tools for makers" },
];
const TYPES = ["case_study", "brand", "launch", "process", "talk", "post"];
const TITLES = [
  "Rebuilding the dispatch board around how drivers actually plan",
  "A new identity drawn from shipping manifests",
  "What we learned shipping dark mode to 2 million people",
  "How our design system team runs office hours",
  "Designing onboarding for people who hate forms",
  "The making of our variable typeface",
  "Why we killed the dashboard",
  "Prototyping the mobile app in a week",
  "Inside our research ops setup",
  "A calmer settings page",
  "From sketch to launch: the new map view",
  "Our accessibility audit, and what we changed",
];

const out = "public/dev";
mkdirSync(out, { recursive: true });
const hues = [12, 215, 75, 225, 260, 250, 330, 160, 40, 290, 190, 0];
TITLES.forEach((_, i) => {
  const h = hues[i % hues.length];
  writeFileSync(
    `${out}/thumb-${i}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},65%,40%)"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><rect x="180" y="160" width="840" height="580" rx="28" fill="#fff" opacity=".92"/><rect x="240" y="230" width="380" height="36" rx="8" fill="hsl(${h},40%,30%)"/><rect x="240" y="300" width="720" height="18" rx="6" fill="#ddd"/><rect x="240" y="340" width="640" height="18" rx="6" fill="#ddd"/><rect x="240" y="420" width="330" height="250" rx="16" fill="hsl(${h},70%,88%)"/><rect x="630" y="420" width="330" height="250" rx="16" fill="hsl(${(h + 40) % 360},70%,86%)"/></svg>`,
  );
});

await sql`delete from jobs; delete from entries; delete from companies where created_by = 'manual'`.simple();
const ids: string[] = [];
for (const c of COMPANIES) {
  const slug = c.name.toLowerCase().replace(/\s+/g, "-");
  const [row] = await sql<{ id: string }[]>`
    insert into companies (slug, name, brand_color, website, domain, one_liner, created_by)
    values (${slug}, ${c.name}, ${c.color}, ${"https://" + slug + ".example"}, ${slug + ".example"}, ${c.one}, 'manual') returning id`;
  ids.push(row.id);
}
for (const [i, t] of TITLES.entries()) {
  const cid = ids[i % ids.length];
  const company = COMPANIES[i % COMPANIES.length].name;
  await sql`
    insert into entries (slug, title, company_id, type, source_url, source_platform, published_at, thumbnail_url, summary, tags, quality_score, status, featured, origin)
    values (${"demo-" + i}, ${t}, ${cid}, ${TYPES[i % TYPES.length]}::entry_type, ${"https://" + company.toLowerCase().replace(/\s+/g, "-") + ".example/blog/" + i}, 'web',
            ${new Date(Date.now() - i * 4 * 86400000)}, ${i === 5 ? null : `/dev/thumb-${i}.svg`},
            ${"A clear walk-through of the trade-offs behind a real shipped change, with before-and-after screens and what the team measured."},
            ${["product design", "design systems", "brand identity", "research"].slice(i % 3, (i % 3) + 2)}, ${70 + (i % 25)}, 'published', ${i === 0}, 'manual')`;
}
const roles = ["Senior Product Designer", "Brand Designer", "Design Engineer", "Staff Product Designer, Growth", "Head of Design"];
for (const [i, r] of roles.entries()) {
  await sql`insert into jobs (company_id, title, location, remote, url, posted_at, external_id)
            values (${ids[i % 3]}, ${r}, ${["London, UK", "Remote", "New York, NY"][i % 3]}, ${i % 3 === 1}, 'https://example.com/job', ${new Date(Date.now() - i * 86400000)}, ${"demo-" + i})`;
}
console.log(`fixtures: ${COMPANIES.length} companies, ${TITLES.length} entries, ${roles.length} jobs`);
await sql.end();
