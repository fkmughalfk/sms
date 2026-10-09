import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { type HealthResponse } from '@sms/shared';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'sms-api', timestamp: new Date().toISOString() };
  }
}
