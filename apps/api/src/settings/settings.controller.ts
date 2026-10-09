import { Controller, Get } from '@nestjs/common';
import type { Settings } from '@sms/shared';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any signed-in user: company header for printing, default rates. */
  @Get()
  get(): Promise<Settings> {
    return this.settings.get();
  }
}
