import { Module } from '@nestjs/common';
import { RateListsController } from './rate-lists.controller';
import { RateListsService } from './rate-lists.service';

/** Dated market rates that orders book from (orders module, phase O1). */
@Module({
  controllers: [RateListsController],
  providers: [RateListsService],
  exports: [RateListsService],
})
export class RateListsModule {}
