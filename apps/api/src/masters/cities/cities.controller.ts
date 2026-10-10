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
  type CityInput,
  citySchema,
  type MasterListQuery,
  masterListQuerySchema,
  type StatusInput,
  statusSchema,
  type UpdateCityInput,
  updateCitySchema,
  type BulkActionInput,
  bulkActionSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CitiesService } from './cities.service';

/** Spec §5.6 / §7. Everyone signed in can read; writes need `masters.manage` (ADMIN+). */
@Controller('cities')
@RequirePermission('masters.read')
export class CitiesController {
  constructor(private readonly service: CitiesService) {}

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
    @Body(new ZodValidationPipe(citySchema)) body: CityInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.create(actor, body, ip);
  }

  @Patch(':id')
  @RequirePermission('masters.manage')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCitySchema)) body: UpdateCityInput,
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

  /** Select-all on the list: activate, deactivate or delete many; blocked ones are skipped. */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('masters.manage')
  bulk(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(bulkActionSchema)) body: BulkActionInput,
    @ClientIp() ip: string | null,
  ) {
    return this.service.bulk(actor, body, ip);
  }
}
