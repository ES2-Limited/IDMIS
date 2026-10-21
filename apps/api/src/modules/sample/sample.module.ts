import { Module } from '@nestjs/common';
import { SampleController } from './sample.controller';
import { IdempotencyService, IdempotencyInterceptor } from '../../platform/idempotency';

@Module({
  controllers: [SampleController],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService],
})
export class SampleModule {}
