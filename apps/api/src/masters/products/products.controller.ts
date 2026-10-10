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
} from '@nestjs/common';
import {
  type AuthUser,
  type ProductInput,
  type ProductListQuery,
  productListQuerySchema,
  productSchema,
  type StatusInput,
  statusSchema,
  type UpdateProductInput,
  updateProductSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ProductsService } from './products.service';

/** Spec §5.6 / §7. Everyone signed in can read; writes need `masters.manage` (ADMIN+). */
@Controller('products')
@RequirePermission('masters.read')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery) {
    return this.service.list(query);
  }

  /** Active records for dropdowns. */
  @Get('options')
  options() {
    return this.service.productOptions();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission('masters.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(productSchema)) body: ProductInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(actor, body, ip);
  }

  @Patch(':id')
  @RequirePermission('masters.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.update(actor, id, body, ip);
  }

  @Patch(':id/status')
  @RequirePermission('masters.manage')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.setStatus(actor, id, body.isActive, ip);
  }

  /** Only records nothing uses; anything referenced must be deactivated instead (409). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('masters.manage')
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string, @ClientIp() ip: string | null) {
    return this.service.remove(actor, id, ip);
  }
}
