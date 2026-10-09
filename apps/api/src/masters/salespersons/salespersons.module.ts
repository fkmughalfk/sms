import { Module } from '@nestjs/common';
import { SalespersonsController } from './salespersons.controller';
import { SalespersonsService } from './salespersons.service';

@Module({
  controllers: [SalespersonsController],
  providers: [SalespersonsService],
  exports: [SalespersonsService],
})
export class SalespersonsModule {}
