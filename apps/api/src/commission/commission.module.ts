import { Global, Module } from '@nestjs/common';
import { CommissionController } from './commission.controller';
import { CommissionService } from './commission.service';

/** Salesman commission. Global: invoices split their commission with it when saved. */
@Global()
@Module({
  controllers: [CommissionController],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
