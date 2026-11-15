import postgres from "postgres";

// One shared Postgres client for the app server and the pipeline.
// On Vercel use Supabase's transaction pooler URL (port 6543); prepared statements are off for pgbouncer.
type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __dwSql: Sql | undefined;
}

function client(): Sql {
  if (!globalThis.__dwSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalThis.__dwSql = postgres(url, {
      prepare: false,
      max: process.env.VERCEL ? 1 : 5,
      idle_timeout: 20,
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return globalThis.__dwSql;
}

// Lazily connect on first use so importing this module (e.g. during `next build`) never needs a database.
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_t, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
