import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type LedgerQuery,
  ledgerQuerySchema,
  type RecoveryQuery,
  recoveryQuerySchema,
} from '@sms/shared';
import { RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecoveryService } from './recovery.service';

/** Spec §5.4 / §7 — party position, recovery summary and party ledger. */
@Controller('recovery')
@RequirePermission('payment.read')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  @Get('parties')
  summary(@Query(new ZodValidationPipe(recoveryQuerySchema)) query: RecoveryQuery) {
    return this.recovery.summary(query);
  }

  @Get('parties/:id/position')
  position(@Param('id') id: string) {
    return this.recovery.position(id);
  }

  @Get('parties/:id/ledger')
  ledger(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQuery,
  ) {
    return this.recovery.ledger(id, query);
  }
}
