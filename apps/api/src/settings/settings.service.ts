import { Injectable } from '@nestjs/common';
import {
  type AuthUser,
  DEFAULT_COMMISSION_RATE,
  type Settings,
  type UpdateSettingsInput,
} from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import type { Db } from '../masters/master.service';
import { PrismaService } from '../prisma/prisma.service';

/** Company settings (spec §5.8): one row, id = 1. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(db: Db = this.prisma): Promise<Settings> {
    const s = await db.setting.findUnique({ where: { id: 1 } });
    return {
      companyName: s?.companyName ?? 'WAQAR RICE MILLS',
      companyAddress: s?.companyAddress ?? 'Shamshad Khan Shaheed Road, Kamoke',
      defaultCommissionRate: s?.defaultCommissionRate.toString() ?? DEFAULT_COMMISSION_RATE,
      annualSalesTarget: s?.annualSalesTarget.toString() ?? '10000000000',
      fiscalYearStartMonth: s?.fiscalYearStartMonth ?? 1,
      userEditWindowHours: s?.userEditWindowHours ?? 24,
    };
  }

  /**
   * SUPER_ADMIN only (controller). A new default commission rate applies to invoices
   * saved from now on — saved lines keep their snapshot (CLAUDE.md rule 4).
   */
  async update(user: AuthUser, input: UpdateSettingsInput, ip: string | null): Promise<Settings> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.get(tx);
      // The address column is NOT NULL: a cleared address is stored as ''.
      const { companyAddress, ...rest } = input;
      const data = {
        ...rest,
        ...(companyAddress !== undefined ? { companyAddress: companyAddress ?? '' } : {}),
      };
      await tx.setting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
      const after = await this.get(tx);
      await this.audit.log(
        { userId: user.id, action: 'UPDATE', entity: 'Setting', entityId: '1', before, after, ip },
        tx,
      );
      return after;
    });
  }
}
