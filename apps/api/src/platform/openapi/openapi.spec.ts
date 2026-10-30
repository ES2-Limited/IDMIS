import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DiscoveryService } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../filters';
import { buildOpenApiDocument } from './openapi.builder';
import { OpenApiController } from './openapi.controller';
import { SampleController } from '../../modules/sample/sample.controller';

const APPROVED_TAGS = [
  'auth',
  'users',
  'assignments',
  'organisations',
  'wuas',
  'geography',
  'lookups',
  'settings',
  'files',
  'imports',
  'audit',
  'outbox',
  'health',
  'slis',
] as const;

describe('OpenAPI & Swagger UI (FEAT-DOCS)', () => {
  let app: NestFastifyApplication;
  let discoveryService: DiscoveryService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_DOCS_ENABLED = 'true';

    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    discoveryService = app.get(DiscoveryService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('(a) OpenAPI 3.x Document Validity', () => {
    it('produces a valid OpenAPI 3.1.0 document with expected metadata and security scheme', () => {
      const doc = buildOpenApiDocument('/');

      expect(doc.openapi).toMatch(/^3\./);
      expect(doc.info.title).toBe('TRIMING IDMIS 2.0 API');
      expect(doc.info.version).toBeDefined();
      expect(doc.servers).toEqual([{ url: '/', description: 'API base path' }]);

      // Verify bearerAuth security scheme
      const securitySchemes = doc.components.securitySchemes;
      expect(securitySchemes).toBeDefined();
      expect(securitySchemes?.bearerAuth).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: expect.any(String),
      });

      // Verify tags match approved tag list
      const tagNames = doc.tags.map((t) => t.name);
      for (const approvedTag of APPROVED_TAGS) {
        expect(tagNames).toContain(approvedTag);
      }

      // Verify all $ref pointers in paths resolve to an existing schema
      const definedSchemas = Object.keys(doc.components.schemas);
      const jsonStr = JSON.stringify(doc.paths);
      const refMatches = jsonStr.match(/"\$ref":"#\/components\/schemas\/([a-zA-Z0-9_]+)"/g) || [];

      expect(refMatches.length).toBeGreaterThan(0);
      for (const match of refMatches) {
        const schemaName = match.replace(/"\$ref":"#\/components\/schemas\/([a-zA-Z0-9_]+)"/, '$1');
        expect(
          definedSchemas,
          `$ref target "${schemaName}" must exist in components.schemas`,
        ).toContain(schemaName);
      }
    });

    it('applies bearerAuth to all secured endpoints and omits security from public endpoints', () => {
      const doc = buildOpenApiDocument('/');

      // Public endpoints that must not require bearerAuth
      const publicEndpoints: Array<{ path: string; method: string }> = [
        { path: '/health', method: 'get' },
        { path: '/auth/sign-in', method: 'post' },
        { path: '/auth/refresh', method: 'post' },
        { path: '/imports/{batchId}/progress', method: 'get' },
      ];

      for (const { path, method } of publicEndpoints) {
        const op = doc.paths[path]?.[method] as { security?: unknown[] } | undefined;
        expect(op, `Expected ${method.toUpperCase()} ${path} in spec`).toBeDefined();
        expect(op?.security).toBeUndefined();
      }

      // Check secured business endpoints
      const securedEndpoints: Array<{ path: string; method: string }> = [
        { path: '/auth/me', method: 'get' },
        { path: '/auth/totp/setup', method: 'post' },
        { path: '/admin/users', method: 'get' },
        { path: '/admin/users', method: 'post' },
        { path: '/admin/assignments', method: 'post' },
        { path: '/admin/organisations', method: 'get' },
        { path: '/wuas', method: 'get' },
        { path: '/geography/states', method: 'get' },
        { path: '/admin/lookups/types', method: 'get' },
        { path: '/admin/settings', method: 'get' },
        { path: '/files/upload/initiate', method: 'post' },
        { path: '/imports', method: 'get' },
        { path: '/admin/audit-logs', method: 'get' },
        { path: '/admin/outbox/dead', method: 'get' },
      ];

      for (const { path, method } of securedEndpoints) {
        const op = doc.paths[path]?.[method] as
          { security?: Array<{ bearerAuth?: unknown[] }> } | undefined;
        expect(op, `Expected ${method.toUpperCase()} ${path} in spec`).toBeDefined();
        expect(op?.security).toEqual([{ bearerAuth: [] }]);
      }
    });

    it('sets the OpenAPI server URL from API_PUBLIC_BASE_PATH / parameter', () => {
      const docCustom = buildOpenApiDocument('/api');
      expect(docCustom.servers).toEqual([{ url: '/api', description: 'API base path' }]);
    });
  });

  describe('(b) Route Marker Discovery Coverage Assertion', () => {
    it('ensures every registered controller route appears in the OpenAPI spec with an approved tag and response schema', () => {
      const doc = buildOpenApiDocument();
      const controllers = discoveryService.getControllers();

      const ignoredControllers = new Set([OpenApiController.name, SampleController.name]);

      const methodEnumToString: Record<number, string> = {
        [RequestMethod.GET]: 'get',
        [RequestMethod.POST]: 'post',
        [RequestMethod.PUT]: 'put',
        [RequestMethod.DELETE]: 'delete',
        [RequestMethod.PATCH]: 'patch',
      };

      const discoveredRoutes: Array<{
        controller: string;
        method: string;
        path: string;
      }> = [];

      for (const controllerWrapper of controllers) {
        const { instance, metatype } = controllerWrapper;
        if (!instance || !metatype) continue;

        const controllerName = metatype.name;
        if (ignoredControllers.has(controllerName)) continue;

        const basePath = Reflect.getMetadata('path', metatype) || '';
        const prototype = Object.getPrototypeOf(instance);
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (m) => m !== 'constructor' && typeof prototype[m] === 'function',
        );

        for (const methodName of methodNames) {
          const fn = prototype[methodName];
          const rawMethodPath = Reflect.getMetadata('path', fn);
          const rawMethod = Reflect.getMetadata('method', fn);
          const isSse = Reflect.getMetadata('__sse__', fn);

          if (rawMethodPath === undefined && !isSse) continue;

          const httpMethod = isSse ? 'get' : (methodEnumToString[rawMethod as number] ?? 'get');

          const joined =
            ('/' + basePath + '/' + (rawMethodPath || ''))
              .replace(/\/+/g, '/')
              .replace(/\/$/, '') || '/';

          const openApiPath = joined.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

          discoveredRoutes.push({
            controller: controllerName,
            method: httpMethod,
            path: openApiPath,
          });
        }
      }

      // Assert that we discovered business routes
      expect(discoveredRoutes.length).toBeGreaterThanOrEqual(45);

      const missingFromSpec: string[] = [];
      const invalidTags: string[] = [];
      const missingResponses: string[] = [];

      for (const route of discoveredRoutes) {
        const pathItem = doc.paths[route.path];
        if (!pathItem) {
          missingFromSpec.push(
            `Missing path: ${route.method.toUpperCase()} ${route.path} (${route.controller})`,
          );
          continue;
        }

        const operation = pathItem[route.method] as
          | {
              tags?: string[];
              summary?: string;
              responses?: Record<string, { content?: Record<string, unknown> }>;
            }
          | undefined;

        if (!operation) {
          missingFromSpec.push(
            `Missing operation: ${route.method.toUpperCase()} ${route.path} (${route.controller})`,
          );
          continue;
        }

        // Tag assertion
        const opTags = operation.tags || [];
        const hasApprovedTag = opTags.some((t) => (APPROVED_TAGS as readonly string[]).includes(t));
        if (!hasApprovedTag) {
          invalidTags.push(
            `${route.method.toUpperCase()} ${route.path} has tags [${opTags.join(', ')}], expected one of APPROVED_TAGS`,
          );
        }

        // Summary assertion
        expect(
          operation.summary,
          `${route.method.toUpperCase()} ${route.path} must have a summary`,
        ).toBeDefined();
        expect(operation.summary!.length).toBeGreaterThan(0);

        // Response schema assertion
        const responses = operation.responses || {};
        const successStatus = responses['200'] || responses['201'];
        if (!successStatus || !successStatus.content) {
          missingResponses.push(
            `${route.method.toUpperCase()} ${route.path} missing 200/201 response schema`,
          );
        }
      }

      expect(missingFromSpec).toEqual([]);
      expect(invalidTags).toEqual([]);
      expect(missingResponses).toEqual([]);
    });
  });

  describe('(c) Swagger UI & Docs Availability (/docs)', () => {
    it('serves Swagger UI HTML at GET /docs with local assets and spec configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<title>TRIMING IDMIS 2.0 API Docs</title>');
      expect(response.body).toContain('/docs/static/swagger-ui.css');
      expect(response.body).toContain('/docs/static/swagger-ui-bundle.js');
      expect(response.body).toContain("url: '/docs/openapi.json'");
      // Ensure no external CDN references
      expect(response.body).not.toContain('unpkg.com');
      expect(response.body).not.toContain('cdnjs.cloudflare.com');
      expect(response.body).not.toContain('jsdelivr.net');
    });

    it('serves Swagger UI static assets locally with correct MIME type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/docs/static/swagger-ui.css',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/css');
      expect(response.body.length).toBeGreaterThan(100);
    });

    it('returns RFC 9457 404 Problem Details when API_DOCS_ENABLED=false', async () => {
      const prevVal = process.env.API_DOCS_ENABLED;
      try {
        process.env.API_DOCS_ENABLED = 'false';

        const docsUiRes = await app.inject({
          method: 'GET',
          url: '/docs',
        });
        expect(docsUiRes.statusCode).toBe(404);
        expect(docsUiRes.headers['content-type']).toContain('application/problem+json');
        const docsUiBody = JSON.parse(docsUiRes.body);
        expect(docsUiBody.type).toBe('/errors/not-found');
        expect(docsUiBody.status).toBe(404);

        const openApiRes = await app.inject({
          method: 'GET',
          url: '/docs/openapi.json',
        });
        expect(openApiRes.statusCode).toBe(404);
        expect(openApiRes.headers['content-type']).toContain('application/problem+json');

        const staticRes = await app.inject({
          method: 'GET',
          url: '/docs/static/swagger-ui.css',
        });
        expect(staticRes.statusCode).toBe(404);
      } finally {
        if (prevVal !== undefined) {
          process.env.API_DOCS_ENABLED = prevVal;
        } else {
          delete process.env.API_DOCS_ENABLED;
        }
      }
    });

    it('logs that docs are disabled on bootstrap when API_DOCS_ENABLED=false', () => {
      const prevVal = process.env.API_DOCS_ENABLED;
      try {
        process.env.API_DOCS_ENABLED = 'false';
        const controller = new OpenApiController();
        const loggerSpy = vi.spyOn(controller['logger'], 'log');
        controller.onApplicationBootstrap();
        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('docs are disabled'));
      } finally {
        if (prevVal !== undefined) {
          process.env.API_DOCS_ENABLED = prevVal;
        } else {
          delete process.env.API_DOCS_ENABLED;
        }
      }
    });
  });
});
