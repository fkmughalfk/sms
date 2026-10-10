import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  type AuthUser,
  type InvoiceFilter,
  invoiceFilterSchema,
  type InvoiceInput,
  invoiceInputSchema,
  type InvoiceListQuery,
  invoiceListQuerySchema,
  type BulkDeleteInput,
  bulkDeleteSchema,
} from '@sms/shared';
import type { Response } from 'express';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildInvoiceWorkbook } from './invoice-export';
import { InvoicesService } from './invoices.service';

/**
 * Spec §5.2–5.3, §7. Reads are limited to the user's data scope; edit rights
 * (own + time window for USER) are checked in the service.
 */
@Controller('invoices')
@RequirePermission('invoice.read')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ) {
    return this.invoices.list(user, query);
  }

  @Get('lines')
  lines(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ) {
    return this.invoices.lines(user, query);
  }

  @Get('next-number')
  nextNumber() {
    return this.invoices.nextNumber();
  }

  /** Excel export of the Lines view (ADMIN+). */
  @Get('export')
  @RequirePermission('export.excel')
  async export(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(invoiceFilterSchema)) filter: InvoiceFilter,
    @Res() res: Response,
  ) {
    const rows = await this.invoices.exportLines(user, filter);
    const buffer = await buildInvoiceWorkbook(rows);
    const stamp = filter.month ?? [filter.from, filter.to].filter(Boolean).join('_to_') ?? 'all';
    res
      .status(200)
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader('Content-Disposition', `attachment; filename="invoices-${stamp || 'all'}.xlsx"`)
      .send(buffer);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('invoice.create')
  preview(@Body(new ZodValidationPipe(invoiceInputSchema)) body: InvoiceInput) {
    return this.invoices.preview(body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.get(user, id);
  }

  @Post()
  @RequirePermission('invoice.create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(invoiceInputSchema)) body: InvoiceInput,
    @ClientIp() ip: string | null,
  ) {
    return this.invoices.create(user, body, ip);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(invoiceInputSchema)) body: InvoiceInput,
    @ClientIp() ip: string | null,
  ) {
    return this.invoices.update(user, id, body, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('invoice.delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.invoices.remove(user, id, ip);
  }

  /** Select-all on the list: soft-delete many; ones outside your scope are skipped. */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('invoice.delete')
  bulkRemove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkDeleteSchema)) body: BulkDeleteInput,
    @ClientIp() ip: string | null,
  ) {
    return this.invoices.bulkRemove(user, body.ids, ip);
  }
}
