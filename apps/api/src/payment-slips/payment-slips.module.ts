import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentSlipsController } from './payment-slips.controller';
import { PaymentSlipsService } from './payment-slips.service';

/** Bank slips and transfer screenshots behind payments (orders module, phase O5). */
@Module({
  imports: [PaymentsModule],
  controllers: [PaymentSlipsController],
  providers: [PaymentSlipsService],
})
export class PaymentSlipsModule {}
