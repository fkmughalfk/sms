import { Module } from '@nestjs/common';
import { SubPartiesController } from './sub-parties.controller';
import { SubPartiesService } from './sub-parties.service';

@Module({
  controllers: [SubPartiesController],
  providers: [SubPartiesService],
  exports: [SubPartiesService],
})
export class SubPartiesModule {}
