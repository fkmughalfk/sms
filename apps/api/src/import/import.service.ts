import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser, ImportMapping, ImportReport } from '@sms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { applyPlan, loadExisting } from './apply';
import { buildPlan } from './plan';
import { parseWorkbook } from './workbook';

/** Excel import (spec §11): a dry run reports; a real run re-plans and writes in one transaction. */
@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    user: AuthUser,
    file: Buffer,
    mapping: ImportMapping,
    dryRun: boolean,
    ip: string | null,
  ): Promise<ImportReport> {
    let workbook;
    try {
      workbook = await parseWorkbook(file);
    } catch {
      throw new BadRequestException('That file could not be read as an .xlsx workbook.');
    }

    if (dryRun) {
      const plan = buildPlan(workbook, await loadExisting(this.prisma), mapping);
      return { ...plan.report, dryRun: true };
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Re-plan against the state inside the transaction, so nothing is imported twice.
        const plan = buildPlan(workbook, await loadExisting(tx), mapping);
        if (!plan.report.ready) {
          throw new BadRequestException({
            message: 'The import is not ready: fix the problems and map every party name first.',
            report: { ...plan.report, dryRun: true },
          });
        }
        const created = await applyPlan(tx, plan, user.id, ip);
        return { ...plan.report, dryRun: false, created };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
