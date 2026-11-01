import { Module } from '@nestjs/common';
import { Clock } from '../common/clock';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

@Module({
  controllers: [RecoveryController],
  providers: [RecoveryService, Clock],
})
export class RecoveryModule {}
