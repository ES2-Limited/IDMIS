import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CachedResponse, CachedResponseSchema } from './cached-response';

export const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
export const IDEMPOTENCY_LOCK_TTL_SECONDS = 30; // 30 seconds in-flight lock

export interface LockResult {
  acquired: boolean;
  existingHash?: string;
}

@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);
  private redisClient: Redis | null = null;

  // In-memory fallback
  private readonly inMemoryCache = new Map<string, { value: string; expiresAt: number }>();
  private readonly inMemoryLocks = new Map<string, { bodyHash: string; expiresAt: number }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && process.env.NODE_ENV !== 'test') {
      try {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        this.redisClient.on('error', (err) => {
          this.logger.warn(`Redis connection error, falling back to memory: ${err.message}`);
        });
      } catch (err) {
        this.logger.warn(`Failed to initialize Redis client: ${(err as Error).message}`);
        this.redisClient = null;
      }
    }
  }

  buildCacheKey(
    userId: string | undefined,
    method: string,
    route: string,
    idempotencyKey: string,
  ): string {
    const user = userId && userId.trim() ? userId : 'anon';
    const cleanMethod = method.toUpperCase();
    const cleanRoute = route.split('?')[0] || '/';
    return `idempotency:${user}:${cleanMethod}:${cleanRoute}:${idempotencyKey}`;
  }

  async acquireLock(
    cacheKey: string,
    bodyHash: string,
    ttlSeconds = IDEMPOTENCY_LOCK_TTL_SECONDS,
  ): Promise<LockResult> {
    const lockKey = `lock:${cacheKey}`;

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const result = await this.redisClient.set(lockKey, bodyHash, 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
          return { acquired: true };
        }
        const existingHash = (await this.redisClient.get(lockKey)) || undefined;
        return { acquired: false, existingHash };
      } catch (err) {
        this.logger.warn(`Redis acquireLock failed: ${(err as Error).message}`);
      }
    }

    // In-memory fallback
    const now = Date.now();
    const existingLock = this.inMemoryLocks.get(lockKey);
    if (existingLock && now < existingLock.expiresAt) {
      return { acquired: false, existingHash: existingLock.bodyHash };
    }

    this.inMemoryLocks.set(lockKey, {
      bodyHash,
      expiresAt: now + ttlSeconds * 1000,
    });
    return { acquired: true };
  }

  async releaseLock(cacheKey: string): Promise<void> {
    const lockKey = `lock:${cacheKey}`;
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.del(lockKey);
        return;
      } catch (err) {
        this.logger.warn(`Redis releaseLock failed: ${(err as Error).message}`);
      }
    }

    this.inMemoryLocks.delete(lockKey);
  }

  async get(cacheKey: string): Promise<CachedResponse | null> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const raw = await this.redisClient.get(cacheKey);
        if (!raw) return null;
        return CachedResponseSchema.parse(JSON.parse(raw));
      } catch (err) {
        this.logger.warn(`Redis get failed: ${(err as Error).message}`);
      }
    }

    const item = this.inMemoryCache.get(cacheKey);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.inMemoryCache.delete(cacheKey);
      return null;
    }
    return CachedResponseSchema.parse(JSON.parse(item.value));
  }

  async set(
    cacheKey: string,
    response: CachedResponse,
    ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
  ): Promise<void> {
    const serialized = JSON.stringify(response);

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(cacheKey, serialized, 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(`Redis set failed: ${(err as Error).message}`);
      }
    }

    this.inMemoryCache.set(cacheKey, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  clearInMemory(): void {
    this.inMemoryCache.clear();
    this.inMemoryLocks.clear();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }
}
