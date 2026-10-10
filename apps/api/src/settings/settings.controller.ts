import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  type AuthUser,
  type Settings,
  type UpdateSettingsInput,
  updateSettingsSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any signed-in user: company header for printing, default rates. */
  @Get()
  get(): Promise<Settings> {
    return this.settings.get();
  }

  /** Spec §5.8 — SUPER_ADMIN only. */
  @Patch()
  @RequirePermission('settings.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
    @ClientIp() ip: string | null,
  ): Promise<Settings> {
    return this.settings.update(user, body, ip);
  }
}
