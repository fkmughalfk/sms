import { Injectable } from '@nestjs/common';
import type { BankInput, NamedRow } from '@sms/shared';
import { type Db, type MasterDelegate, MasterService } from '../master.service';

@Injectable()
export class BanksService extends MasterService<NamedRow, NamedRow, BankInput> {
  protected readonly entity = 'Bank';
  protected readonly label = 'bank';
  protected readonly select = { id: true, name: true, isActive: true };
  protected delegate(db: Db) {
    return db.bank as unknown as MasterDelegate<NamedRow>;
  }
}
