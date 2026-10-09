import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { type ImportMapping, importMappingSchema, type ImportReport } from '@sms/shared';
import { directDatabaseUrl } from '../config/database-url';
import { PrismaClient } from '../generated/prisma/client';
import { applyPlan, loadExisting } from './apply';
import { buildPlan } from './plan';
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

function printReport(r: ImportReport) {
  const s = r.summary;
  console.log('\nWould import' + (r.dryRun ? ' (dry run — nothing written)' : '') + ':');
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(13)} ${JSON.stringify(v)}`);
  console.log('\nRecalculated vs Excel:');
  for (const c of r.comparison) {
    console.log(
      `  ${c.matches ? 'OK ' : 'DIFF'} ${c.metric.padEnd(32)} excel ${String(c.excel).padStart(16)}  app ${c.computed.padStart(16)}`,
    );
  }
  if (r.mismatches.length) {
    console.log(
      `\n${r.mismatches.length} line(s) where the recalculated value differs from Excel:`,
    );
    for (const m of r.mismatches.slice(0, 20)) {
      console.log(
        `  invoice ${m.invoiceNo} row ${m.row} ${m.product} ${m.field}: excel ${m.excel} app ${m.computed}`,
      );
    }
  }
  if (r.unmatchedParties.length) {
    console.log('\nSheet1 party names:');
    for (const u of r.unmatchedParties) {
      console.log(
        `  "${u.raw}" (${u.payments} payments, ${u.amount}) → ${u.mapping ? JSON.stringify(u.mapping) : `UNMAPPED (suggest: ${u.suggestion ?? '—'})`}`,
      );
    }
  }
  if (r.problems.length) {
    console.log('\nProblems:');
    for (const p of r.problems) console.log(`  ${p.sheet} row ${p.row}: ${p.message}`);
  }
  console.log(
    `\n${r.ready ? 'Ready to import.' : 'Not ready — map every party name and fix the problems above.'}`,
  );
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
    const workbook = await parseWorkbook(readFileSync(here(file)));
    const plan = buildPlan(workbook, await loadExisting(prisma), mapping);

    const out = arg('--write-mapping');
    if (out) {
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

    if (dryRun || !plan.report.ready) {
      printReport({ ...plan.report, dryRun: true });
      if (!dryRun) process.exitCode = 1;
      return;
    }

    const actor = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!actor)
      throw new Error('No active SUPER_ADMIN to record the import against (run the seed).');

    const result = await prisma.$transaction(
      async (tx) => {
        const fresh = buildPlan(workbook, await loadExisting(tx), mapping);
        return { report: fresh.report, created: await applyPlan(tx, fresh, actor.id, null) };
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
    printReport({ ...result.report, dryRun: false });
    console.log(`\nImported as ${actor.email}:`, result.created);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
