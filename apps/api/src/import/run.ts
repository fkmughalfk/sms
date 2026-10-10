import type { ImportMapping, ImportReport } from '@sms/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { applyPlan, loadExisting } from './apply';
import { buildPlan } from './plan';
import { parseWorkbook } from './workbook';

export interface StandaloneImportResult {
  report: ImportReport;
  /** Set when the import ran (not a dry run, and nothing blocked it). */
  created?: NonNullable<ImportReport['created']>;
}

/**
 * Workbook import outside Nest (CLI and `prisma db seed`): plan against the database,
 * then — unless it's a dry run or something blocks it — write everything in one
 * transaction against the first active SUPER_ADMIN.
 */
export async function importWorkbook(
  prisma: PrismaClient,
  file: Buffer,
  mapping: ImportMapping,
  opts: { dryRun: boolean },
): Promise<StandaloneImportResult> {
  const workbook = await parseWorkbook(file);
  const plan = buildPlan(workbook, await loadExisting(prisma), mapping);
  if (opts.dryRun || !plan.report.ready) return { report: { ...plan.report, dryRun: true } };

  const actor = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!actor) throw new Error('No active SUPER_ADMIN to record the import against.');

  return prisma.$transaction(
    async (tx) => {
      // Re-plan inside the transaction so nothing is imported twice.
      const fresh = buildPlan(workbook, await loadExisting(tx), mapping);
      const created = await applyPlan(tx, fresh, actor.id, null);
      return { report: { ...fresh.report, dryRun: false, created }, created };
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
}
