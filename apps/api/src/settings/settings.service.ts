import { Injectable } from '@nestjs/common';
import { DEFAULT_COMMISSION_RATE, type Settings } from '@sms/shared';
import type { Db } from '../masters/master.service';
import { PrismaService } from '../prisma/prisma.service';

/** Company settings (spec §5.8). Editing arrives with the Settings screen (phase 8). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
