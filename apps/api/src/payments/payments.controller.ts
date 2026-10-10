import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  type AuthUser,
  type PaymentFilter,
  paymentFilterSchema,
  type PaymentInput,
  paymentInputSchema,
  type PaymentListQuery,
  paymentListQuerySchema,
  type UpdatePaymentInput,
  updatePaymentSchema,
  type BulkDeleteInput,
  bulkDeleteSchema,
} from '@sms/shared';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildPaymentWorkbook } from './payment-export';
import { PaymentsService } from './payments.service';

/** Spec §5.4 / §7. Everyone records payments; editing, deleting and export are ADMIN+. */
@Controller('payments')
@RequirePermission('payment.read')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paymentListQuerySchema)) query: PaymentListQuery,
  ) {
    return this.payments.list(user, query);
  }

  @Get('export')
  @RequirePermission('export.excel')
  async export(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paymentFilterSchema)) filter: PaymentFilter,
    @Res() res: Response,
  ) {
    const buffer = await buildPaymentWorkbook(await this.payments.exportRows(user, filter));
    const stamp = filter.month ?? ([filter.from, filter.to].filter(Boolean).join('_to_') || 'all');
    res
      .status(200)
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader('Content-Disposition', `attachment; filename="payments-${stamp}.xlsx"`)
      .send(buffer);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.get(user, id);
  }

  @Post()
  @RequirePermission('payment.create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(paymentInputSchema)) body: PaymentInput,
    @ClientIp() ip: string | null,
  ) {
    return this.payments.create(user, body, ip);
  }

  @Patch(':id')
  @RequirePermission('payment.edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentSchema)) body: UpdatePaymentInput,
    @ClientIp() ip: string | null,
  ) {
    return this.payments.update(user, id, body, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('payment.delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.payments.remove(user, id, ip);
  }

  /** Select-all on the list: soft-delete many; ones outside your scope are skipped. */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payment.delete')
  bulkRemove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkDeleteSchema)) body: BulkDeleteInput,
    @ClientIp() ip: string | null,
  ) {
    return this.payments.bulkRemove(user, body.ids, ip);
  }
}
