import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { ProblemDetailsFilter } from './platform/filters';
import { OpenApiModule } from './platform/openapi';
import { SampleModule } from './modules/sample/sample.module';

const isProduction = process.env.NODE_ENV === 'production';
const devModules = !isProduction ? [SampleModule] : [];

@Module({
  imports: [OpenApiModule, ...devModules],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
