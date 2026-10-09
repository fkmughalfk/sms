import { Controller, Get, Query } from '@nestjs/common';
import {
  type AuthUser,
  type ReportQuery,
  reportQuerySchema,
  type TrendQuery,
  trendQuerySchema,
} from '@sms/shared';
import { CurrentUser } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportsService } from './reports.service';

const reportQuery = new ZodValidationPipe(reportQuerySchema);

/**
 * Spec §5.5 / §7. Every role may view; a USER's figures are limited to their own
 * data (spec §3 note **), applied in the service.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.dashboard(user, query);
  }

  @Get('by-category')
  byCategory(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.byCategory(user, query);
  }

  @Get('by-salesperson')
  bySalesperson(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.bySalesperson(user, query);
  }

  @Get('by-product')
  byProduct(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.byProduct(user, query);
  }

  @Get('by-party')
  byParty(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.byParty(user, query);
  }

  @Get('by-city')
  byCity(@CurrentUser() user: AuthUser, @Query(reportQuery) query: ReportQuery) {
    return this.reports.byCity(user, query);
  }

  @Get('trend')
  trend(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ) {
    return this.reports.trend(user, query);
  }
}
