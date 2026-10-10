import { Injectable } from '@nestjs/common';
import type { SubPartyInput, SubPartyListQuery, SubPartyOption, SubPartyRow } from '@sms/shared';
import type { Prisma } from '../../generated/prisma/client';
import { byRelationName } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService } from '../master.service';
import { assertActiveRef, nameContains } from '../master-utils';

const select = {
  id: true,
  name: true,
  partyId: true,
  party: { select: { id: true, name: true } },
  isActive: true,
} as const;
type Rec = Prisma.SubPartyGetPayload<{ select: typeof select }>;

@Injectable()
export class SubPartiesService extends MasterService<
  Rec,
  SubPartyRow,
  SubPartyInput,
  SubPartyListQuery
> {
  protected readonly entity = 'SubParty';
  protected readonly label = 'sub-party';
  protected readonly select = select;
  protected override readonly sortColumns = { party: byRelationName('party') };

  protected delegate(db: Db) {
    return db.subParty as unknown as MasterDelegate<Rec>;
  }

  protected override listWhere(query: SubPartyListQuery): object {
    return { ...nameContains(query.search), ...(query.partyId ? { partyId: query.partyId } : {}) };
  }

  /**
   * Names are unique per parent party, and among unassigned sub-parties. (The DB
   * unique index can't enforce the unassigned case: NULLs never clash in Postgres.)
   */
  protected override uniqueNameWhere(name: string, merged: Partial<SubPartyInput>): object {
    return { name, partyId: merged.partyId ?? null };
  }

  protected override nameScopeChanged(input: Partial<SubPartyInput>): boolean {
    return input.partyId !== undefined;
  }

  protected override async beforeWrite(db: Db, input: Partial<SubPartyInput>, existing?: Rec) {
    if (input.partyId && input.partyId !== existing?.partyId) {
      const party = await db.party.findUnique({
        where: { id: input.partyId },
        select: { isActive: true },
      });
      assertActiveRef(party, 'Select an active party.');
    }
  }

  /** For the invoice/payment form: the party's own sub-parties plus unassigned ones (spec §5.2). */
  subPartyOptions(partyId?: string): Promise<SubPartyOption[]> {
    return this.prisma.subParty.findMany({
      where: { isActive: true, ...(partyId ? { OR: [{ partyId }, { partyId: null }] } : {}) },
      select: { id: true, name: true, partyId: true },
      orderBy: { name: 'asc' },
    });
  }
}
