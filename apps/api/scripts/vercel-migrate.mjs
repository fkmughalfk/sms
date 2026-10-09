// Runs during the Vercel *production* build of sms-api (see apps/api/vercel.json):
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

run('prisma migrate deploy');

if (process.env.SEED_SUPERADMIN_EMAIL && process.env.SEED_SUPERADMIN_PASSWORD) {
  run('prisma db seed');
} else {
  console.log('[vercel-migrate] SEED_SUPERADMIN_* not set — skipping seed.');
}
