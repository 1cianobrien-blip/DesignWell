import { sql } from "./db";

export type Settings = {
  publish_threshold: number;
  review_threshold: number;
  daily_spend_cap_usd: number;
  review_expiry_days: number;
  source_pause_min_candidates: number;
  source_pause_max_reject_rate: number;
  pipeline_enabled: boolean;
  weekly_draft_limit: number;
  monthly_spend_cap_usd: number;
};

export const DEFAULT_SETTINGS: Settings = {
  publish_threshold: 75,
  review_threshold: 55,
  daily_spend_cap_usd: 4,
  weekly_draft_limit: 20,
  monthly_spend_cap_usd: 12,
  review_expiry_days: 14,
  source_pause_min_candidates: 15,
  source_pause_max_reject_rate: 0.9,
  pipeline_enabled: true,
};

export async function getSettings(): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in s) s[r.key] = r.value;
  return s as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await sql`insert into settings (key, value, updated_at) values (${key}, ${sql.json(value as never)}, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}
