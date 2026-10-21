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
    trustProxy: true,
  });

  registerRequestIdHook(fastifyAdapter.getInstance());

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
  app.useGlobalFilters(new ProblemDetailsFilter());

  // CORS: strictly origin = APP_URL with credentials: true, never '*'
  app.enableCors({
    origin: env.APP_URL,
    credentials: true,
  });

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
