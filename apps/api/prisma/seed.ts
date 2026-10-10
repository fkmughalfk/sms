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

/** The client's workbook and Sheet1 decisions, committed so production deploys can load them. */
const DEFAULT_WORKBOOK = resolve(__dirname, 'seed-data/workbook.xlsx');
const DEFAULT_MAPPING = resolve(__dirname, 'seed-data/mapping.json');

/**
 * Idempotent seed (spec §13 phase 2): settings row, categories, first SUPER_ADMIN.
 * Safe to re-run — never overwrites an existing user's password.
 *
 * Then, once per database, the Excel workbook (spec §11): see seedWorkbookOnce.
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

    await seedWorkbookOnce(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Loads the Excel workbook — but only if this database has never had an Excel import.
 * After that the app is the source of truth: re-importing could bring back payments
 * deleted in the app or double-count edited ones.
 *
 * Workbook: SEED_WORKBOOK, else prisma/seed-data/workbook.xlsx (skipped if neither exists).
 * Mapping:  SEED_MAPPING,  else prisma/seed-data/mapping.json.
 * A workbook with problems is reported and skipped — it never fails the seed (or a deploy).
 */
async function seedWorkbookOnce(prisma: PrismaClient) {
  const file = process.env.SEED_WORKBOOK?.trim()
    ? fromRoot(process.env.SEED_WORKBOOK.trim())
    : DEFAULT_WORKBOOK;
  if (!existsSync(file)) {
    if (process.env.SEED_WORKBOOK?.trim())
      console.warn(`\nSEED_WORKBOOK not found: ${file} — skipped.`);
    return;
  }

  const previous = await prisma.auditLog.findFirst({
    where: { action: 'IMPORT' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (previous) {
    console.log(
      `\nExcel workbook already imported (${previous.createdAt.toISOString().slice(0, 10)}) — skipped.`,
    );
    return;
  }

  const mappingPath = process.env.SEED_MAPPING?.trim()
    ? fromRoot(process.env.SEED_MAPPING.trim())
    : DEFAULT_MAPPING;
  const mapping = importMappingSchema.parse(
    existsSync(mappingPath) ? JSON.parse(readFileSync(mappingPath, 'utf8')) : {},
  );

  console.log(`\nLoading Excel workbook ${file} …`);
  const result = await importWorkbook(prisma, readFileSync(file), mapping, { dryRun: false });
  printReport(result.report);
  if (result.created) {
    console.log('\nWorkbook loaded:', result.created);
  } else {
    console.warn(
      '\n⚠ WORKBOOK NOT LOADED — fix the problems above in the workbook and deploy again. Nothing was written.',
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
