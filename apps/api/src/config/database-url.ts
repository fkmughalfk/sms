// Connection strings by the names Neon/Vercel may use. The Vercel Neon integration sets
// DATABASE_URL (pooled) + DATABASE_URL_UNPOOLED; older Vercel Postgres projects use POSTGRES_*.

type Env = Record<string, string | undefined>;

const first = (env: Env, names: string[]) => names.map((n) => env[n]).find((v) => v?.trim());

/** Pooled URL for the running app. */
export const POOLED_URL_VARS = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL'];

/** Direct (non-pooled) URL for migrations; falls back to the pooled one. */
export const DIRECT_URL_VARS = [
  'DIRECT_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  ...POOLED_URL_VARS,
];

export const pooledDatabaseUrl = (env: Env = process.env) => first(env, POOLED_URL_VARS);
export const directDatabaseUrl = (env: Env = process.env) => first(env, DIRECT_URL_VARS);
