import { Injectable } from '@nestjs/common';
import type { SalespersonInput, SalespersonRow } from '@sms/shared';
import { byFields } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService, type Usage } from '../master.service';

@Injectable()
export class SalespersonsService extends MasterService<
  SalespersonRow,
  SalespersonRow,
  SalespersonInput
> {
  protected readonly entity = 'Salesperson';
  protected readonly label = 'salesperson';
  protected readonly select = { id: true, name: true, phone: true, isActive: true };
  protected override readonly sortColumns = byFields('phone');
  protected delegate(db: Db) {
    return db.salesperson as unknown as MasterDelegate<SalespersonRow>;
  }

  protected async usage(db: Db, id: string): Promise<Usage[]> {
    return [
      ['invoice', 'invoices', await db.invoice.count({ where: { salespersonId: id } })],
      ['user', 'users', await db.user.count({ where: { salespersonId: id } })],
    ];
  }
}
