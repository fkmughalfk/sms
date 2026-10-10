import { Injectable } from '@nestjs/common';
import type { SalespersonInput, SalespersonRow } from '@sms/shared';
import { byFields } from '../../common/sorting';
import { type Db, type MasterDelegate, MasterService } from '../master.service';

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
}
