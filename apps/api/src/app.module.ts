import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ProblemDetailsFilter } from './platform/filters';
import { OpenApiModule } from './platform/openapi';
import { RedisModule } from './platform/redis/redis.module';
import { AuditModule } from './platform/audit/audit.module';
import { OutboxModule } from './platform/outbox/outbox.module';
import { AuthModule } from './modules/auth/auth.module';
import { SampleModule } from './modules/sample/sample.module';

const isProduction = process.env.NODE_ENV === 'production';
const devModules = !isProduction ? [SampleModule] : [];

@Module({
  imports: [RedisModule, AuditModule, OutboxModule, AuthModule, OpenApiModule, ...devModules],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
