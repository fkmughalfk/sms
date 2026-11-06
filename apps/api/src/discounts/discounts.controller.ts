import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { type AuthUser, discountReverseSchema } from '@sms/shared';
import { z } from 'zod';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DiscountsService } from './discounts.service';

const partyQuery = z.object({ partyId: z.string().trim().min(1, 'Choose a party.') });

/** Prompt-payment discount credits (docs/ORDERS_DELIVERY_SPEC.md §6). */
@Controller('discounts')
@RequirePermission('payment.read')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  forParty(@Query(new ZodValidationPipe(partyQuery)) q: { partyId: string }) {
    return this.discounts.forParty(q.partyId);
  }

  /** Take a credited discount back (office); it is not credited again. */
  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment.edit')
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(discountReverseSchema)) body: { reason: string },
    @ClientIp() ip: string | null,
  ) {
    return this.discounts.reverse(user, id, body.reason, ip);
  }
}
