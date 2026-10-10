import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { emailSchema, importMappingSchema, passwordSchema } from '@sms/shared';
import * as argon2 from 'argon2';
import { directDatabaseUrl } from '../src/config/database-url';
import { PrismaClient } from '../src/generated/prisma/client';
import { printReport } from '../src/import/print-report';
import { importWorkbook } from '../src/import/run';

/** Seed paths are relative to the repository root (e.g. `data/…`). */
const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(__dirname, '../../..', p));

/**
 * Idempotent seed (spec §13 phase 2): settings row, categories, first SUPER_ADMIN.
 * Safe to re-run — never overwrites an existing user's password.
 *
 * Optionally loads the client's Excel workbook too (spec §11), when SEED_WORKBOOK is
 * set — e.g. SEED_WORKBOOK="data/Sales Management System.xlsx" and
 * SEED_MAPPING="data/mapping.json". The workbook stays out of git (data/ is ignored),
 * so Vercel builds never see it; run the seed from a machine that has the file.
 */
async function main() {
  const connectionString = directDatabaseUrl();
  if (!connectionString) throw new Error('Set DATABASE_URL (or DIRECT_URL) before seeding.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });

  try {
    await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

    for (const name of ['Rice', 'Pulses', 'Other']) {
      await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    }

    const email = emailSchema.parse(process.env.SEED_SUPERADMIN_EMAIL);
    const password = passwordSchema.parse(process.env.SEED_SUPERADMIN_PASSWORD);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`SUPER_ADMIN ${email} already exists — left unchanged.`);
    } else {
      await prisma.user.create({
        data: {
          name: 'Super Admin',
          email,
          role: 'SUPER_ADMIN',
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
      });
      console.log(`Created SUPER_ADMIN ${email}. Change the password after first login.`);
    }

    await seedWorkbook(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedWorkbook(prisma: PrismaClient) {
  const workbook = process.env.SEED_WORKBOOK?.trim();
  if (!workbook) return;
  const file = fromRoot(workbook);
  if (!existsSync(file)) throw new Error(`SEED_WORKBOOK not found: ${file}`);

  const mappingPath = process.env.SEED_MAPPING?.trim();
  const mapping = importMappingSchema.parse(
    mappingPath ? JSON.parse(readFileSync(fromRoot(mappingPath), 'utf8')) : {},
  );

  console.log(`\nLoading workbook ${file} …`);
  const result = await importWorkbook(prisma, readFileSync(file), mapping, { dryRun: false });
  printReport(result.report);
  if (!result.created) {
    throw new Error('Workbook not loaded — fix the problems above (nothing was written).');
  }
  console.log('\nWorkbook loaded:', result.created);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
