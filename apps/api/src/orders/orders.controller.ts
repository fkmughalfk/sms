import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AuthUser,
  type OrderInput,
  orderInputSchema,
  type OrderListQuery,
  orderListQuerySchema,
  type OrderReasonInput,
  orderReasonSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersService } from './orders.service';

/**
 * Orders (docs/ORDERS_DELIVERY_SPEC.md §3). Everyone can book; salesmen (USER) see their
 * own orders and wait for approval; the office (`order.manage`) approves, edits and closes.
 */
@Controller('orders')
@RequirePermission('order.read')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    return this.orders.list(user, query);
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
