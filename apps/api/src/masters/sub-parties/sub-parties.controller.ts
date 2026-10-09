import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AuthUser,
  type StatusInput,
  statusSchema,
  type SubPartyInput,
  type SubPartyListQuery,
  subPartyListQuerySchema,
  type SubPartyOptionsQuery,
  subPartyOptionsQuerySchema,
  subPartySchema,
  type UpdateSubPartyInput,
  updateSubPartySchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { SubPartiesService } from './sub-parties.service';

/** Spec §5.6 / §7. Everyone signed in can read; writes need `masters.manage` (ADMIN+). */
@Controller('sub-parties')
@RequirePermission('masters.read')
export class SubPartiesController {
  constructor(private readonly service: SubPartiesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(subPartyListQuerySchema)) query: SubPartyListQuery) {
    return this.service.list(query);
  }

  /** Active sub-parties of `partyId` plus unassigned ones. */
  @Get('options')
  options(@Query(new ZodValidationPipe(subPartyOptionsQuerySchema)) query: SubPartyOptionsQuery) {
    return this.service.subPartyOptions(query.partyId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission('masters.manage')
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(subPartySchema)) body: SubPartyInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(actor, body, ip);
  }

  @Patch(':id')
  @RequirePermission('masters.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubPartySchema)) body: UpdateSubPartyInput,
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
