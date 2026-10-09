import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AuthUser,
  type CategoryInput,
  categorySchema,
  type MasterListQuery,
  masterListQuerySchema,
  type StatusInput,
  statusSchema,
  type UpdateCategoryInput,
  updateCategorySchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CategoriesService } from './categories.service';

/** Spec §5.6 / §7. Everyone signed in can read; writes need `categories.manage` (ADMIN+). */
@Controller('categories')
@RequirePermission('masters.read')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(masterListQuerySchema)) query: MasterListQuery) {
    return this.service.list(query);
  }

  /** Active records for dropdowns. */
  @Get('options')
  options() {
    return this.service.options();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission('categories.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(categorySchema)) body: CategoryInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(actor, body, ip);
  }

  @Patch(':id')
  @RequirePermission('categories.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.update(actor, id, body, ip);
  }

  @Patch(':id/status')
  @RequirePermission('categories.manage')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: StatusInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.setStatus(actor, id, body.isActive, ip);
  }
}
