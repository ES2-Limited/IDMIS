import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
