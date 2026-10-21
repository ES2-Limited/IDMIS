import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './platform/filters';
import { genRequestId, registerRequestIdHook } from './platform/logger/logger.config';
import { ProblemDetailsSchema, ConflictProblemSchema } from '@idmis/contracts';

describe('API Platform Plumbing (BE-1.2)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const adapter = new FastifyAdapter({
      logger: false,
      genReqId: genRequestId,
    });
    registerRequestIdHook(adapter.getInstance());

    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RFC 9457 Problem Details Error Filter & Relative URIs', () => {
    it('returns RFC 9457 Problem Details on validation error (400) with relative type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        payload: {
          message: 'hi', // too short (< 3 chars)
          count: -1, // invalid (not positive)
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.headers['x-request-id']).toBeDefined();

      const body = JSON.parse(response.body);
      const parsed = ProblemDetailsSchema.parse(body);

      expect(parsed.status).toBe(400);
      expect(parsed.title).toBe('Validation Failed');
      expect(parsed.type).toBe('/errors/validation-failed');
      expect(parsed.errors).toBeDefined();
      expect(parsed.errors!.length).toBeGreaterThanOrEqual(2);
      expect(parsed.requestId).toBeDefined();

      const fields = parsed.errors!.map((e) => e.field);
      expect(fields).toContain('message');
      expect(fields).toContain('count');
    });

    it('returns RFC 9457 Conflict Problem Details on 409 Conflict with relative type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/sample/conflict-test',
      });

      expect(response.statusCode).toBe(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.headers['x-request-id']).toBeDefined();

      const body = JSON.parse(response.body);
      const parsed = ConflictProblemSchema.parse(body);

      expect(parsed.status).toBe(409);
      expect(parsed.title).toBe('Conflict');
      expect(parsed.type).toBe('/errors/conflict');
      expect(parsed.code).toBe('VERSION_CONFLICT');
      expect(parsed.currentVersion).toBe(4);
      expect(parsed.requestId).toBeDefined();
      expect(parsed.current).toEqual({
        id: '018f3a5e-0000-7000-8000-000000000001',
        name: 'Hadejia Valley Scheme Phase 1',
        version: 4,
      });
    });

    it('returns 500 problem with type /errors/internal, title, status and requestId only (no message or stack leakage)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/sample/unexpected-error',
      });

      expect(response.statusCode).toBe(500);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.headers['x-request-id']).toBeDefined();

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        type: '/errors/internal',
        title: 'Internal Server Error',
        status: 500,
        requestId: response.headers['x-request-id'],
      });
      // Ensure no error message or stack trace is leaked in response
      expect(body.message).toBeUndefined();
      expect(body.stack).toBeUndefined();
      expect(body.detail).toBeUndefined();
    });
  });

  describe('Request IDs (UUID generation & header propagation)', () => {
    it('generates a new UUID when X-Request-Id is omitted and returns it in header and problem body', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/sample/unexpected-error',
      });

      const reqId = response.headers['x-request-id'] as string;
      expect(reqId).toBeDefined();
      expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const body = JSON.parse(response.body);
      expect(body.requestId).toBe(reqId);
    });

    it('preserves and echoes a valid incoming X-Request-Id UUID header', async () => {
      const clientReqId = '018f3a5e-2222-7000-8000-000000000001';
      const response = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'x-request-id': clientReqId,
        },
        payload: {
          message: 'Hello IDMIS with reqId',
          count: 10,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers['x-request-id']).toBe(clientReqId);
    });

    it('replaces an invalid (non-UUID) incoming X-Request-Id header with a valid UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'x-request-id': 'malformed-not-a-uuid',
        },
        payload: {
          message: 'Valid message here',
          count: 3,
        },
      });

      const reqId = response.headers['x-request-id'] as string;
      expect(reqId).not.toBe('malformed-not-a-uuid');
      expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('Idempotency Interceptor (4 Core Scenarios)', () => {
    const validUuidKey1 = '018f3a5e-3333-7000-8000-000000000001';
    const validUuidKey2 = '018f3a5e-3333-7000-8000-000000000002';
    const validUuidKey3 = '018f3a5e-3333-7000-8000-000000000003';
    const validUuidKey4 = '018f3a5e-3333-7000-8000-000000000004';

    it('rejects a non-UUID idempotency key with RFC 9457 Problem Details', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'idempotency-key': 'not-a-uuid',
        },
        payload: {
          message: 'Hello IDMIS',
          count: 5,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const body = JSON.parse(response.body);
      expect(body.errors?.[0]?.field).toBe('idempotency-key');
    });

    // Scenario 1: Replay with same key + same body returns stored response
    it('Scenario 1: returns stored response on repeated request with same key and body', async () => {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'idempotency-key': validUuidKey1,
        },
        payload: {
          message: 'Echo test idempotency',
          count: 42,
        },
      });

      expect(firstResponse.statusCode).toBe(201);
      expect(firstResponse.headers['x-idempotent-replay']).toBeUndefined();
      const firstBody = JSON.parse(firstResponse.body);
      const originalTimestamp = firstBody.processedAt;

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'idempotency-key': validUuidKey1,
        },
        payload: {
          message: 'Echo test idempotency',
          count: 42,
        },
      });

      expect(secondResponse.statusCode).toBe(201);
      expect(secondResponse.headers['x-idempotent-replay']).toBe('true');
      const secondBody = JSON.parse(secondResponse.body);
      expect(secondBody.processedAt).toBe(originalTimestamp);
    });

    // Scenario 2: Same key with different body hash -> 422 Problem
    it('Scenario 2: returns 422 problem when same key is used with a different request body hash', async () => {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'idempotency-key': validUuidKey2,
        },
        payload: {
          message: 'Original payload message',
          count: 10,
        },
      });
      expect(firstResponse.statusCode).toBe(201);

      // Second request with DIFFERENT body
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/sample/echo',
        headers: {
          'idempotency-key': validUuidKey2,
        },
        payload: {
          message: 'Modified different payload message',
          count: 99,
        },
      });

      expect(secondResponse.statusCode).toBe(422);
      expect(secondResponse.headers['content-type']).toContain('application/problem+json');
      const body = JSON.parse(secondResponse.body);
      expect(body.type).toBe('/errors/unprocessable-entity');
      expect(body.status).toBe(422);
      expect(body.detail).toContain('different request payload');
    });

    // Scenario 3: Same key while first request is in flight -> 409 problem "request in progress"
    it('Scenario 3: returns 409 problem "request in progress" when same key is called concurrently', async () => {
      // Fire first slow request without waiting
      const firstPromise = app.inject({
        method: 'POST',
        url: '/sample/slow',
        headers: {
          'idempotency-key': validUuidKey3,
        },
        payload: {
          message: 'Concurrent slow test',
          count: 1,
        },
      });

      // Small delay to ensure first request is currently in-flight
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Fire concurrent second request with the same idempotency key
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/sample/slow',
        headers: {
          'idempotency-key': validUuidKey3,
        },
        payload: {
          message: 'Concurrent slow test',
          count: 1,
        },
      });

      expect(secondResponse.statusCode).toBe(409);
      const conflictBody = JSON.parse(secondResponse.body);
      expect(conflictBody.type).toBe('/errors/conflict');
      expect(conflictBody.status).toBe(409);
      expect(conflictBody.detail).toBe(
        'A request with this idempotency key is currently in progress',
      );

      const firstResponse = await firstPromise;
      expect(firstResponse.statusCode).toBe(201);
    });

    // Scenario 4: 5xx errors are not cached; GET and /health skip idempotency
    it('Scenario 4: does not cache 5xx responses (allowing retries), and skips idempotency for GET and /health', async () => {
      // 1. 5xx response is not cached, lock is released on error
      const failedResponse = await app.inject({
        method: 'POST',
        url: '/sample/server-error',
        headers: {
          'idempotency-key': validUuidKey4,
        },
      });
      expect(failedResponse.statusCode).toBe(500);

      // Lock should have been released on error, allowing retry (not stuck in 409)
      const retryResponse = await app.inject({
        method: 'POST',
        url: '/sample/server-error',
        headers: {
          'idempotency-key': validUuidKey4,
        },
      });
      expect(retryResponse.statusCode).toBe(500);

      // 2. GET and /health skip idempotency
      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'idempotency-key': validUuidKey4,
        },
      });
      expect(healthResponse.statusCode).toBe(200);
      expect(healthResponse.headers['idempotency-key']).toBeUndefined();
      expect(healthResponse.headers['x-idempotent-replay']).toBeUndefined();
    });
  });

  describe('OpenAPI Generation (/docs/openapi.json)', () => {
    it('serves valid OpenAPI 3.1 document at /docs/openapi.json', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/openapi.json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const doc = JSON.parse(response.body);
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.info.title).toBe('TRIMING IDMIS 2.0 API');
      expect(doc.paths['/health']).toBeDefined();
      expect(doc.paths['/sample/echo']).toBeDefined();
      expect(doc.paths['/sample/conflict-test']).toBeDefined();
      expect(doc.components.schemas.ProblemDetails).toBeDefined();
      expect(doc.components.schemas.ConflictProblem).toBeDefined();
      expect(doc.components.schemas.SampleEchoInput).toBeDefined();
    });
  });

  describe('Production Guard', () => {
    it('does not register sample endpoints in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const { AppModule: ProdAppModule } = await import('./app.module?prod=' + Date.now());

      const prodApp = await NestFactory.create<NestFastifyApplication>(
        ProdAppModule,
        new FastifyAdapter(),
        { logger: false },
      );
      prodApp.useGlobalFilters(new ProblemDetailsFilter());
      await prodApp.init();
      await prodApp.getHttpAdapter().getInstance().ready();

      const response = await prodApp.inject({
        method: 'POST',
        url: '/sample/echo',
        payload: { message: 'test prod', count: 1 },
      });

      expect(response.statusCode).toBe(404);
      await prodApp.close();
      process.env.NODE_ENV = prevEnv;
    });
  });
});
