import { Injectable } from '@nestjs/common';
import type { PartyInput, PartyListQuery, PartyOption, PartyRow } from '@sms/shared';
import type { Prisma } from '../../generated/prisma/client';
import { byFields, byRelationName } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService } from '../master.service';
import { assertActiveRef, nameContains } from '../master-utils';

const select = {
  id: true,
  name: true,
  cityId: true,
  city: { select: { id: true, name: true } },
  phone: true,
  openingBalance: true,
  isActive: true,
} as const;
type Rec = Prisma.PartyGetPayload<{ select: typeof select }>;

@Injectable()
export class PartiesService extends MasterService<Rec, PartyRow, PartyInput, PartyListQuery> {
  protected readonly entity = 'Party';
  protected readonly label = 'party';
  protected readonly select = select;
  protected override readonly sortColumns = {
    ...byFields('phone', 'openingBalance'),
    city: byRelationName('city'),
  };

  protected delegate(db: Db) {
    return db.party as unknown as MasterDelegate<Rec>;
  }

  protected override toRow(rec: Rec): PartyRow {
    return { ...rec, openingBalance: rec.openingBalance.toString() };
  }

  protected override listWhere(query: PartyListQuery): object {
    return { ...nameContains(query.search), ...(query.cityId ? { cityId: query.cityId } : {}) };
  }

  protected override async beforeWrite(db: Db, input: Partial<PartyInput>, existing?: Rec) {
    if (input.cityId && input.cityId !== existing?.cityId) {
      const city = await db.city.findUnique({
        where: { id: input.cityId },
        select: { isActive: true },
      });
      assertActiveRef(city, 'Select an active city.');
    }
  }

  /** Dropdown rows; `cityId` pre-fills the invoice city (spec §5.2). */
  partyOptions(): Promise<PartyOption[]> {
    return this.prisma.party.findMany({
      where: { isActive: true },
      select: { id: true, name: true, cityId: true },
      orderBy: { name: 'asc' },
    });
  }
}
