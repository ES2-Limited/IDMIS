import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { SlisModule } from '../slis/slis.module';
import { MeModule } from '../me/me.module';
import { BlisModule } from '../blis/blis.module';
import { RedisModule } from '../../platform/redis/redis.module';
import { DashboardService } from './services/dashboard.service';
import { DashboardController } from './controllers/dashboard.controller';

@Module({
  imports: [CoreModule, SlisModule, MeModule, BlisModule, RedisModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
