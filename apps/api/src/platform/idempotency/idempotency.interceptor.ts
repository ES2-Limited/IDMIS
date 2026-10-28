import {
  Injectable,
  Inject,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, of, from, throwError } from 'rxjs';
import { tap, catchError, mergeMap } from 'rxjs/operators';
import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { IdempotencyKeySchema } from '@idmis/contracts';
import { IdempotencyService } from './idempotency.service';
import { CachedResponse } from './cached-response';
import { NO_IDEMPOTENCY_KEY } from '../auth/no-idempotency.decorator';
import { Reflector } from '@nestjs/core';

function computeBodyHash(body: unknown): string {
  if (body === undefined || body === null) return '';
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IdempotencyService) private readonly idempotencyService: IdempotencyService,
    private readonly reflector?: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const method = req.method.toUpperCase();
    // Skip idempotency for GET, HEAD, OPTIONS
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const url = req.url || '';
    // Skip idempotency for /health
    if (url === '/health' || url.startsWith('/health/')) {
      return next.handle();
    }

    // Skip idempotency for /auth/reset-password to prevent caching temporary passwords in Redis
    if (url === '/auth/reset-password' || url.startsWith('/auth/reset-password/')) {
      return next.handle();
    }

    if (this.reflector) {
      const isNoIdempotency = this.reflector.getAllAndOverride<boolean>(NO_IDEMPOTENCY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isNoIdempotency) {
        return next.handle();
      }
    }

    const rawKey = req.headers['idempotency-key'];
    if (!rawKey) {
      return next.handle();
    }

    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const validation = IdempotencyKeySchema.safeParse(key);
    if (!validation.success) {
      throw new BadRequestException({
        message: 'Validation Failed',
        errors: [
          {
            field: 'idempotency-key',
            message: validation.error.issues[0]?.message ?? 'Idempotency-Key must be a valid UUID',
            code: 'invalid_uuid',
          },
        ],
      });
    }

    const validKey = validation.data;
    const userId = (req as unknown as { user?: { id?: string } }).user?.id || 'anon';
    const route =
      (req as unknown as { routerPath?: string }).routerPath || url.split('?')[0] || '/';
    const cacheKey = this.idempotencyService.buildCacheKey(userId, method, route, validKey);
    const bodyHash = computeBodyHash(req.body);

    // 1. Check if response is already cached
    const cached = await this.idempotencyService.get(cacheKey);
    if (cached) {
      // Same key with a different request body hash -> 422 problem
      if (cached.requestBodyHash !== bodyHash) {
        throw new HttpException(
          {
            type: '/errors/unprocessable-entity',
            title: 'Unprocessable Entity',
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            detail: 'Idempotency key was previously used with a different request payload',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      reply.header('x-idempotent-replay', 'true');
      reply.header('idempotency-key', validKey);
      reply.status(cached.statusCode);
      return of(cached.body);
    }

    // 2. First request: acquire in-flight lock
    const lock = await this.idempotencyService.acquireLock(cacheKey, bodyHash);
    if (!lock.acquired) {
      if (lock.existingHash && lock.existingHash !== bodyHash) {
        throw new HttpException(
          {
            type: '/errors/unprocessable-entity',
            title: 'Unprocessable Entity',
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            detail: 'Idempotency key was previously used with a different request payload',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Same key while the first request is in flight -> 409 problem "request in progress"
      throw new HttpException(
        {
          type: '/errors/conflict',
          title: 'Conflict',
          status: HttpStatus.CONFLICT,
          detail: 'A request with this idempotency key is currently in progress',
        },
        HttpStatus.CONFLICT,
      );
    }

    // 3. Process request
    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          const statusCode = reply.statusCode || 200;
          // Do not cache 5xx responses (only cache 2xx)
          if (statusCode >= 200 && statusCode < 300) {
            const cachedPayload: CachedResponse = {
              statusCode,
              headers: {
                'content-type': 'application/json; charset=utf-8',
              },
              body: responseBody,
              cachedAt: new Date().toISOString(),
              requestBodyHash: bodyHash,
            };
            reply.header('idempotency-key', validKey);
            await this.idempotencyService.set(cacheKey, cachedPayload);
          }
        } finally {
          await this.idempotencyService.releaseLock(cacheKey);
        }
      }),
      catchError((err) => {
        return from(this.idempotencyService.releaseLock(cacheKey)).pipe(
          mergeMap(() => throwError(() => err)),
        );
      }),
    );
  }
}
