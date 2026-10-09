import { z } from 'zod';
import { pooledDatabaseUrl } from './database-url';

const durationSchema = z.string().regex(/^\d+[smhd]$/, 'Use a duration like 15m or 7d.');

/** Validated environment (spec §9). Fails fast on boot when something is missing. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  /** Pooled connection string used at runtime (Neon `-pooler` host on Vercel). */
  DATABASE_URL: z.string().min(1),
  /** Max pooled connections; set 1 for the local PGlite server (it serves one connection). */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters.'),
  JWT_ACCESS_TTL: durationSchema.default('15m'),
  JWT_REFRESH_TTL: durationSchema.default('7d'),
  WEB_URL: z.string().default('http://localhost:3000'),
});
export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  // Accept the POSTGRES_* names some Vercel/Neon setups use instead of DATABASE_URL.
  const result = envSchema.safeParse({
    ...raw,
    DATABASE_URL: pooledDatabaseUrl(raw as Record<string, string | undefined>),
  });
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return result.data;
}

/** "15m" → 900000 */
export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return Number(match[1]) * unit;
}
