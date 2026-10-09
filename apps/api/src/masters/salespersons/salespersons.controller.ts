import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AuthUser,
  type MasterListQuery,
  masterListQuerySchema,
  type SalespersonInput,
  salespersonSchema,
  type StatusInput,
  statusSchema,
  type UpdateSalespersonInput,
  updateSalespersonSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SalespersonsService } from './salespersons.service';

/** Spec §5.6 / §7. Everyone signed in can read; writes need `masters.manage` (ADMIN+). */
@Controller('salespersons')
@RequirePermission('masters.read')
export class SalespersonsController {
  constructor(private readonly service: SalespersonsService) {}

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
  @RequirePermission('masters.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(salespersonSchema)) body: SalespersonInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(actor, body, ip);
  }

  @Patch(':id')
  @RequirePermission('masters.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSalespersonSchema)) body: UpdateSalespersonInput,
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
}
