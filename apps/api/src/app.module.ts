import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ProblemDetailsFilter } from './platform/filters';
import { OpenApiModule } from './platform/openapi';
import { RedisModule } from './platform/redis/redis.module';
import { AuditModule } from './platform/audit/audit.module';
import { OutboxModule } from './platform/outbox/outbox.module';
import { StorageModule } from './platform/storage/storage.module';
import { HealthModule } from './platform/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoreModule } from './modules/core/core.module';
import { SlisModule } from './modules/slis/slis.module';
import { MeModule } from './modules/me/me.module';
import { BlisModule } from './modules/blis/blis.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SampleModule } from './modules/sample/sample.module';

const isProduction = process.env.NODE_ENV === 'production';
const devModules = !isProduction ? [SampleModule] : [];

@Module({
  imports: [
    RedisModule,
    AuditModule,
    OutboxModule,
    StorageModule,
    HealthModule,
    AuthModule,
    CoreModule,
    SlisModule,
    MeModule,
    BlisModule,
    DashboardModule,
    OpenApiModule,
    ...devModules,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
