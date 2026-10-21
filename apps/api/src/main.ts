import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import {
  getFastifyLoggerConfig,
  genRequestId,
  registerRequestIdHook,
} from './platform/logger/logger.config';
import { validateApiEnv } from './platform/config/env';
import { ProblemDetailsFilter } from './platform/filters';

async function bootstrap() {
  const env = validateApiEnv();

  const fastifyAdapter = new FastifyAdapter({
    logger: getFastifyLoggerConfig(),
    genReqId: genRequestId,
  });

  registerRequestIdHook(fastifyAdapter.getInstance());

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
  app.useGlobalFilters(new ProblemDetailsFilter());

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
