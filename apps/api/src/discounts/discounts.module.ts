import { Global, Module } from '@nestjs/common';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

/** Prompt-payment discount (orders module, phase O6). Global: payments and invoices keep it in step. */
@Global()
@Module({
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
