import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { type ImportMapping, importMappingSchema } from '@sms/shared';
import { directDatabaseUrl } from '../config/database-url';
import { PrismaClient } from '../generated/prisma/client';
import { loadExisting } from './apply';
import { buildPlan } from './plan';
import { printReport } from './print-report';
import { importWorkbook } from './run';
import { parseWorkbook } from './workbook';

const USAGE = `Usage: pnpm import:excel <workbook.xlsx> [--dry-run] [--mapping mapping.json] [--write-mapping out.json]

  --dry-run          Report only; write nothing (recommended first).
  --mapping FILE     Decisions for Sheet1 party/bank names (see --write-mapping).
  --write-mapping F  Write a mapping file pre-filled with suggestions to edit.`;

/** Paths are relative to where the command was typed (pnpm runs us from apps/api). */
const here = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

function arg(name: string) {
  const i = process.argv.indexOf(name);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  return v ? here(v) : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.log(USAGE);
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  const mappingFile = arg('--mapping');
  const mapping: ImportMapping = importMappingSchema.parse(
    mappingFile ? JSON.parse(readFileSync(mappingFile, 'utf8')) : {},
  );

  const connectionString = directDatabaseUrl();
  if (!connectionString) throw new Error('Set DATABASE_URL (or DIRECT_URL) first.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });

  try {
    const buffer = readFileSync(here(file));

    const out = arg('--write-mapping');
    if (out) {
      const plan = buildPlan(await parseWorkbook(buffer), await loadExisting(prisma), mapping);
      const template: ImportMapping = {
        parties: Object.fromEntries(
          plan.report.unmatchedParties.map((u) => [
            u.key,
            u.mapping ??
              (u.suggestion
                ? { action: 'map', party: u.suggestion }
                : { action: 'create', name: u.raw }),
          ]),
        ),
        banks: Object.fromEntries(plan.report.banks.map((b) => [b.key, b.mapped ?? b.suggestion])),
      };
      writeFileSync(out, JSON.stringify(template, null, 2));
      console.log(`Wrote ${out} — check every suggestion, then pass it with --mapping.`);
    }

    const result = await importWorkbook(prisma, buffer, mapping, { dryRun });
    printReport(result.report);
    if (result.created) console.log('\nImported:', result.created);
    else if (!dryRun) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
