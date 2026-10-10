import { Injectable } from '@nestjs/common';
import type { CityInput, NamedRow } from '@sms/shared';
import { type Db, type MasterDelegate, MasterService, type Usage } from '../master.service';

@Injectable()
export class CitiesService extends MasterService<NamedRow, NamedRow, CityInput> {
  protected readonly entity = 'City';
  protected readonly label = 'city';
  protected readonly select = { id: true, name: true, isActive: true };
  protected delegate(db: Db) {
    return db.city as unknown as MasterDelegate<NamedRow>;
  }

  protected async usage(db: Db, id: string): Promise<Usage[]> {
    return [
      ['party', 'parties', await db.party.count({ where: { cityId: id } })],
      ['invoice', 'invoices', await db.invoice.count({ where: { cityId: id } })],
    ];
  }
}
