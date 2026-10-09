import { Controller, Get } from '@nestjs/common';
import { type HealthResponse } from '@sms/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'sms-api', timestamp: new Date().toISOString() };
  }
}
