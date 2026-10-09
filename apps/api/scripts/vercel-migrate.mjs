// Runs after the Vercel *production* build of sms-api (see apps/api/vercel.json), so
// @sms/shared is already compiled for the seed. It
// applies pending migrations, then the idempotent seed if SEED_SUPERADMIN_* are set.
// Preview/dev builds skip it so they never touch the production database.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (process.env.VERCEL_ENV !== 'production') {
  console.log(
    `[vercel-migrate] VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'} — skipping migrations.`,
  );
  process.exit(0);
}

const URL_VARS = [
  'DIRECT_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
];
if (!URL_VARS.some((name) => process.env[name]?.trim())) {
  console.error(
    [
      '[vercel-migrate] No database connection string in this project’s environment.',
      '  Connect a Neon database to this Vercel project (Storage → Neon → Connect),',
      '  making sure Production is ticked, or add DATABASE_URL yourself. Looked for:',
      `  ${URL_VARS.join(', ')}`,
    ].join('\n'),
  );
  process.exit(1);
}

run('prisma migrate deploy');

if (process.env.SEED_SUPERADMIN_EMAIL && process.env.SEED_SUPERADMIN_PASSWORD) {
  run('prisma db seed');
} else {
  console.log('[vercel-migrate] SEED_SUPERADMIN_* not set — skipping seed.');
}
