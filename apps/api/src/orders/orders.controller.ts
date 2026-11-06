import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AuthUser,
  type OrderInput,
  orderInputSchema,
  type OrderListQuery,
  orderListQuerySchema,
  type OrderReasonInput,
  orderReasonSchema,
  openingMappingSchema,
  type PendingReportQuery,
  pendingReportQuerySchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OpeningImportService } from './opening-import.service';
import { OrdersService } from './orders.service';
import { PendingReportService } from './pending-report.service';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

/**
 * Orders (docs/ORDERS_DELIVERY_SPEC.md §3). Everyone can book; salesmen (USER) see their
 * own orders and wait for approval; the office (`order.manage`) approves, edits and closes.
 */
@Controller('orders')
@RequirePermission('order.read')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly pending: PendingReportService,
    private readonly opening: OpeningImportService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    return this.orders.list(user, query);
  }

  /** "PENDING ORDERS DETAIL": lines still to deliver, by city (salesmen: their own). */
  @Get('pending-report')
  pendingReport(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(pendingReportQuerySchema)) query: PendingReportQuery,
  ) {
    return this.pending.report(user, query);
  }

  /**
   * Go-live: the old pending-orders report (.xlsx / .csv) → opening orders. Dry run unless
   * `dryRun=false`; `mapping` (JSON) decides the names the system doesn't know.
   */
  @Post('opening-import')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('import.run')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  openingImport(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { dryRun?: string; mapping?: string },
    @ClientIp() ip: string | null,
  ) {
    if (!file) throw new BadRequestException('Attach the pending orders file as "file".');
    let json: unknown;
    try {
      json = body.mapping ? JSON.parse(body.mapping) : {};
    } catch {
      throw new BadRequestException('"mapping" must be JSON.');
    }
    const mapping = openingMappingSchema.safeParse(json);
    if (!mapping.success) throw new BadRequestException('"mapping" is not in the expected shape.');
    return this.opening.run(user, file, mapping.data, body.dryRun !== 'false', ip);
  }

  @Get('next-number')
  @RequirePermission('order.create')
  nextNumber() {
    return this.orders.nextNumber();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.get(user, id);
  }

  @Post()
  @RequirePermission('order.create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(orderInputSchema)) body: OrderInput,
    @ClientIp() ip: string | null,
  ) {
    return this.orders.create(user, body, ip);
  }

  /** Salesman: own order until approved. Office: any open order (service checks). */
  @Put(':id')
  @RequirePermission('order.create')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderInputSchema)) body: OrderInput,
    @ClientIp() ip: string | null,
  ) {
    return this.orders.update(user, id, body, ip);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('order.manage')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.orders.approve(user, id, ip);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('order.manage')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @ClientIp() ip: string | null,
  ) {
    return this.orders.reject(user, id, body.reason, ip);
  }

  /** Office: any open order. Salesman: withdraw their own before approval (service checks). */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('order.create')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @ClientIp() ip: string | null,
  ) {
    return this.orders.cancel(user, id, body.reason, ip);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('order.manage')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderReasonSchema)) body: OrderReasonInput,
    @ClientIp() ip: string | null,
  ) {
    return this.orders.close(user, id, body.reason, ip);
  }
}
