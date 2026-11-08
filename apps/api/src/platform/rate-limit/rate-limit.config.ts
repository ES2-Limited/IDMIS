import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

export interface RateLimitConfig {
  redisClient?: Redis | null;
}

export function getKeyForRequest(req: FastifyRequest): string {
  const url = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();
  const ip = req.ip || '127.0.0.1';
  const userId = (req as unknown as { user?: { id?: string } }).user?.id;

  // 1. Auth Login: POST /auth/sign-in or /auth/login
  if (method === 'POST' && (url === '/auth/sign-in' || url === '/auth/login')) {
    const body = req.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : 'none';
    return `auth:${ip}:${email}`;
  }

  // 2. TOTP Verify: POST /auth/totp/verify
  if (method === 'POST' && url === '/auth/totp/verify') {
    const body = req.body as Record<string, unknown> | undefined;
    const identifier = (typeof body?.tempToken === 'string' && body.tempToken) || userId || ip;
    return `auth:${ip}:${identifier}`;
  }

  // 3. Auth Refresh: /auth/refresh
  if (url === '/auth/refresh') {
    return `refresh:${userId || ip}`;
  }

  // 4. Sync push/pull: /sync/push or /sync/pull
  if (url.startsWith('/sync/push') || url.startsWith('/sync/pull')) {
    const deviceId =
      (req.headers['x-device-id'] as string) ||
      (req.headers['x-client-device-id'] as string) ||
      userId ||
      ip;
    return `sync:${deviceId}`;
  }

  // 5. Import initiate: POST /imports/initiate or POST /imports
  if (method === 'POST' && (url.includes('/imports/initiate') || url === '/imports')) {
    return `import:${userId || ip}`;
  }

  // 6. Default general route
  return `gen:${userId || ip}`;
}

export function getMaxForRequest(req: FastifyRequest): number {
  const url = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  // POST /auth/login, /auth/sign-in, /auth/totp/verify: 5/min
  if (
    method === 'POST' &&
    (url === '/auth/sign-in' || url === '/auth/login' || url === '/auth/totp/verify')
  ) {
    return process.env.RATE_LIMIT_AUTH_MAX ? Number(process.env.RATE_LIMIT_AUTH_MAX) : 5;
  }

  // /auth/refresh: 30/min
  if (url === '/auth/refresh') {
    return process.env.RATE_LIMIT_REFRESH_MAX ? Number(process.env.RATE_LIMIT_REFRESH_MAX) : 30;
  }

  // sync push/pull: 60/min
  if (url.startsWith('/sync/push') || url.startsWith('/sync/pull')) {
    return process.env.RATE_LIMIT_SYNC_MAX ? Number(process.env.RATE_LIMIT_SYNC_MAX) : 60;
  }

  // import initiate: 10/hour
  if (method === 'POST' && (url.includes('/imports/initiate') || url === '/imports')) {
    return process.env.RATE_LIMIT_IMPORT_MAX ? Number(process.env.RATE_LIMIT_IMPORT_MAX) : 10;
  }

  // general: 600/min
  return process.env.RATE_LIMIT_DEFAULT_MAX ? Number(process.env.RATE_LIMIT_DEFAULT_MAX) : 600;
}

export function getTimeWindowForRequest(req: FastifyRequest): number {
  const url = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  // import initiate: 1 hour (3600s)
  if (method === 'POST' && (url.includes('/imports/initiate') || url === '/imports')) {
    return 3600 * 1000;
  }

  // All other endpoints: 1 minute (60s)
  return 60 * 1000;
}

export async function registerRateLimit(
  fastify: FastifyInstance,
  options?: RateLimitConfig,
): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  let redisClient: Redis | undefined;

  if (options?.redisClient !== undefined) {
    redisClient = options.redisClient ?? undefined;
  } else if (redisUrl) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      family: 0,
    });
  }

  await fastify.register(fastifyRateLimit, {
    global: true,
    hook: 'preHandler',
    redis: redisClient,
    keyGenerator: (req) => getKeyForRequest(req),
    max: (req) => getMaxForRequest(req),
    timeWindow: (req) => getTimeWindowForRequest(req),
    errorResponseBuilder: (req, context) => {
      const ttlSeconds = Math.ceil((context.ttl || 1000) / 1000);
      return {
        type: '/errors/rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Try again in ${ttlSeconds} seconds.`,
        instance: req.url,
        code: 'RATE_LIMIT_EXCEEDED',
        requestId: (req.headers['x-request-id'] as string) || req.id || 'unknown-req',
        timestamp: new Date().toISOString(),
      };
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}
