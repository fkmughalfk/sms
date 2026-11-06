import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common';
import {
  type AuthUser,
  type CommissionReportQuery,
  commissionReportQuerySchema,
  type CommissionRules,
  commissionRulesSchema,
} from '@sms/shared';
import { ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CommissionService } from './commission.service';

/** Salesman commission (docs/COMMISSION_SPEC.md). Rules and recalculation: SUPER_ADMIN. */
@Controller('commission')
export class CommissionController {
  constructor(private readonly commission: CommissionService) {}

  @Get('rules')
  @RequirePermission('reports.viewAll')
  rules() {
    return this.commission.getRules();
  }

  @Put('rules')
  @RequirePermission('settings.manage')
  putRules(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(commissionRulesSchema)) body: CommissionRules,
    @ClientIp() ip: string | null,
  ) {
    return this.commission.putRules(user, body, ip);
  }

  /** `?dryRun=false` to apply; otherwise only reports before / after. */
  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('settings.manage')
  recalculate(
    @CurrentUser() user: AuthUser,
    @Query('dryRun') dryRun: string | undefined,
    @ClientIp() ip: string | null,
  ) {
    return this.commission.recalculate(user, dryRun !== 'false', ip);
  }

  @Get('report')
  @RequirePermission('reports.viewAll')
  report(@Query(new ZodValidationPipe(commissionReportQuerySchema)) q: CommissionReportQuery) {
    return this.commission.report(q);
  }
}
