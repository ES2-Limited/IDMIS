import { Controller, Post, Get, Body, UseInterceptors } from '@nestjs/common';
import {
  SampleEchoInputSchema,
  type SampleEchoInput,
  type SampleEchoResponse,
} from '@idmis/contracts';
import { ZodValidationPipe } from '../../platform/pipes';
import { IdempotencyInterceptor } from '../../platform/idempotency';
import { ConflictProblemException } from '../../platform/filters';

@Controller('sample')
export class SampleController {
  @Post('echo')
  @UseInterceptors(IdempotencyInterceptor)
  echo(
    @Body(new ZodValidationPipe(SampleEchoInputSchema)) body: SampleEchoInput,
  ): SampleEchoResponse {
    return {
      echoedMessage: body.message,
      count: body.count,
      processedAt: new Date().toISOString(),
    };
  }

  @Post('slow')
  @UseInterceptors(IdempotencyInterceptor)
  async slow(
    @Body(new ZodValidationPipe(SampleEchoInputSchema)) body: SampleEchoInput,
  ): Promise<SampleEchoResponse> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      echoedMessage: body.message,
      count: body.count,
      processedAt: new Date().toISOString(),
    };
  }

  @Post('server-error')
  @UseInterceptors(IdempotencyInterceptor)
  serverError(): never {
    throw new Error('Simulated 500 error during POST');
  }

  @Get('unexpected-error')
  unexpectedError(): never {
    throw new Error('Database connection failed unexpectedly');
  }

  @Get('conflict-test')
  conflictTest(): never {
    throw new ConflictProblemException({
      detail: 'Record was modified concurrently by another user',
      current: {
        id: '018f3a5e-0000-7000-8000-000000000001',
        name: 'Hadejia Valley Scheme Phase 1',
        version: 4,
      },
      currentVersion: 4,
      code: 'VERSION_CONFLICT',
    });
  }
}
