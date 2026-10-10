import { Injectable } from '@nestjs/common';
import type { CategoryInput, CategoryRow } from '@sms/shared';
import type { Prisma } from '../../generated/prisma/client';
import { byFields } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService } from '../master.service';

const select = { id: true, name: true, commissionRate: true, isActive: true } as const;
type Rec = Prisma.CategoryGetPayload<{ select: typeof select }>;

@Injectable()
export class CategoriesService extends MasterService<Rec, CategoryRow, CategoryInput> {
  protected readonly entity = 'Category';
  protected readonly label = 'category';
  protected readonly select = select;
  protected override readonly sortColumns = byFields('commissionRate');

  protected delegate(db: Db) {
    return db.category as unknown as MasterDelegate<Rec>;
  }

  protected override toRow(rec: Rec): CategoryRow {
    return { ...rec, commissionRate: rec.commissionRate?.toString() ?? null };
  }
}
