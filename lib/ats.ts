// Applicant tracking system detection and public job board APIs (Greenhouse, Lever, Ashby).
import { USER_AGENT } from "./http";

export type Ats = { provider: "greenhouse" | "lever" | "ashby"; token: string };

export type AtsJob = {
  external_id: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string;
  department: string | null;
  posted_at: string | null;
};

const PATTERNS: [Ats["provider"], RegExp][] = [
  ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/i],
  ["greenhouse", /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i],
  ["greenhouse", /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i],
  ["lever", /jobs(?:\.eu)?\.lever\.co\/([a-z0-9_.-]+)/i],
  ["lever", /api(?:\.eu)?\.lever\.co\/v0\/postings\/([a-z0-9_.-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/i],
  ["ashby", /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.%-]+)/i],
];
const IGNORE_TOKENS = new Set(["embed", "v1", "jobs", "api", "js", "boards", "job_board", "static", "assets"]);

/** Find an ATS board referenced anywhere in a careers page's HTML or links. */
export function detectAts(htmlOrUrls: string): Ats | null {
  for (const [provider, re] of PATTERNS) {
    const m = htmlOrUrls.match(re);
    if (m && !IGNORE_TOKENS.has(m[1].toLowerCase())) return { provider, token: decodeURIComponent(m[1]) };
  }
  return null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const REMOTE_RE = /\bremote\b|anywhere|distributed/i;

export async function fetchAtsJobs(ats: Ats): Promise<AtsJob[] | null> {
  if (ats.provider === "greenhouse") {
    type G = { jobs: { id: number; title: string; absolute_url: string; updated_at?: string; first_published?: string; location?: { name?: string }; departments?: { name: string }[] }[] };
    const d = await getJson<G>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ats.token)}/jobs?content=true`);
    if (!d) return null;
    return d.jobs.map((j) => ({
      external_id: String(j.id),
      title: j.title.trim(),
      location: j.location?.name ?? null,
      remote: REMOTE_RE.test(j.location?.name ?? ""),
      url: j.absolute_url,
      department: j.departments?.[0]?.name ?? null,
      posted_at: j.first_published ?? j.updated_at ?? null,
    }));
  }
  if (ats.provider === "lever") {
    type L = { id: string; text: string; hostedUrl: string; createdAt?: number; workplaceType?: string; categories?: { location?: string; team?: string; department?: string } }[];
    const d = await getJson<L>(`https://api.lever.co/v0/postings/${encodeURIComponent(ats.token)}?mode=json`);
    if (!d || !Array.isArray(d)) return null;
    return d.map((j) => ({
      external_id: j.id,
      title: j.text.trim(),
      location: j.categories?.location ?? null,
      remote: j.workplaceType === "remote" || REMOTE_RE.test(j.categories?.location ?? ""),
      url: j.hostedUrl,
      department: j.categories?.department ?? j.categories?.team ?? null,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    }));
  }
  type A = { jobs: { id: string; title: string; location?: string; department?: string; team?: string; isRemote?: boolean; workplaceType?: string; jobUrl: string; publishedAt?: string; isListed?: boolean }[] };
  const d = await getJson<A>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ats.token)}`);
  if (!d?.jobs) return null;
  return d.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      external_id: j.id,
      title: j.title.trim(),
      location: j.location ?? null,
      remote: !!j.isRemote || j.workplaceType === "Remote" || REMOTE_RE.test(j.location ?? ""),
      url: j.jobUrl,
      department: j.department ?? j.team ?? null,
      posted_at: j.publishedAt ?? null,
    }));
}

/** Check a board exists. For Greenhouse, also returns the board's company name. */
export async function verifyAts(ats: Ats): Promise<{ ok: boolean; name?: string }> {
  if (ats.provider === "greenhouse") {
    const d = await getJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ats.token)}`);
    return { ok: !!d, name: d?.name };
  }
  const jobs = await fetchAtsJobs(ats);
  return { ok: jobs !== null };
}

// ---------------------------------------------------------------------------
// Design role filter
// ---------------------------------------------------------------------------
const INCLUDE = [
  /\bdesign(er|ers)?\b/i,
  /\b(ux|ui|ux\/ui|ui\/ux)\b/i,
  /\buser (experience|interface)\b/i,
  /\b(creative|art) director\b/i,
  /\billustrator\b/i,
  /\bmotion (designer|artist)\b/i,
  /\bdesign ?ops\b/i,
  /\bdesign technologist\b/i,
];
const EXCLUDE = [
  /\b(asic|fpga|soc|silicon|chip|circuit|pcb|analog|rf|mixed[- ]signal|physical design|verification|dft|layout engineer)\b/i,
  /\b(mechanical|hardware|electrical|structural|civil|interior|industrial engineer|manufacturing|tooling|packaging engineer)\b/i,
  /\b(instructional|learning|curriculum|game|level|narrative|systems? designer, game|solution|solutions|database|network|test|experiment|clinical|trial|program design|compensation|benefits|org(anization(al)?)? design)\b/i,
];
// Excluded unless the title clearly names a design role ("Product Designer, Growth Marketing" is fine).
const EXCLUDE_SOFT = /\b(sales|account executive|recruiter|recruiting|marketing manager|engineer(ing)? manager|software engineer|developer)\b/i;

export function isDesignRole(title: string, department?: string | null): boolean {
  const t = title.replace(/\s+/g, " ");
  if (EXCLUDE.some((re) => re.test(t))) return false;
  if (EXCLUDE_SOFT.test(t) && !/\bdesigner\b|design systems?|design engineer/i.test(t)) return false;
  if (INCLUDE.some((re) => re.test(t))) return true;
  // e.g. "Staff Engineer, Design Systems" or a "Brand" title inside a Design department.
  if (/design systems?/i.test(t)) return true;
  if (department && /\bdesign\b/i.test(department) && /\b(brand|visual|research|writer|content)\b/i.test(t)) return true;
  return false;
}
