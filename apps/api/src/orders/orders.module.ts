import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OpeningImportService } from './opening-import.service';
import { OrdersService } from './orders.service';
import { PendingReportService } from './pending-report.service';

/** Orders booked at rate-list rates (orders module, phase O2). */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PendingReportService, OpeningImportService],
  exports: [OrdersService],
})
export class OrdersModule {}
