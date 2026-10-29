import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis | null = null;
  private readonly inMemoryStore = new Map<string, { value: string; expiresAt: number }>();
  private readonly pubSubEmitter = new EventEmitter();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && process.env.NODE_ENV !== 'test') {
      try {
        this.redisClient = new Redis(redisUrl, {
          family: 0,
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

  getClient(): Redis | null {
    return this.redisClient;
  }

  async get(key: string): Promise<string | null> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        return await this.redisClient.get(key);
      } catch (err) {
        this.logger.warn(`Redis get error: ${(err as Error).message}`);
      }
    }

    const item = this.inMemoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.inMemoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        if (ttlSeconds) {
          await this.redisClient.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.redisClient.set(key, value);
        }
        return;
      } catch (err) {
        this.logger.warn(`Redis set error: ${(err as Error).message}`);
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
    this.inMemoryStore.set(key, { value, expiresAt });
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const result = await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (err) {
        this.logger.warn(`Redis setNx error: ${(err as Error).message}`);
      }
    }

    const now = Date.now();
    const existing = this.inMemoryStore.get(key);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    this.inMemoryStore.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return true;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const result = await this.redisClient.incr(key);
        if (result === 1 && ttlSeconds) {
          await this.redisClient.expire(key, ttlSeconds);
        }
        return result;
      } catch (err) {
        this.logger.warn(`Redis incr error: ${(err as Error).message}`);
      }
    }

    const now = Date.now();
    const existing = this.inMemoryStore.get(key);
    let val = 1;
    let expiresAt = ttlSeconds ? now + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
    if (existing && existing.expiresAt > now) {
      val = parseInt(existing.value, 10) + 1;
      expiresAt = existing.expiresAt;
    }
    this.inMemoryStore.set(key, { value: String(val), expiresAt });
    return val;
  }

  async del(key: string): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis del error: ${(err as Error).message}`);
      }
    }
    this.inMemoryStore.delete(key);
  }

  async isLockedOut(email: string): Promise<boolean> {
    const key = `lockout:blocked:${email.toLowerCase()}`;
    const blocked = await this.get(key);
    return blocked !== null;
  }

  async recordFailedAttempt(email: string): Promise<{ locked: boolean; attempts: number }> {
    const normEmail = email.toLowerCase();
    const attemptsKey = `lockout:attempts:${normEmail}`;
    const blockedKey = `lockout:blocked:${normEmail}`;

    const attempts = await this.incr(attemptsKey, 900); // 15 mins
    if (attempts >= 5) {
      await this.set(blockedKey, '1', 900); // 15 mins block
      return { locked: true, attempts };
    }
    return { locked: false, attempts };
  }

  async clearLockout(email: string): Promise<void> {
    const normEmail = email.toLowerCase();
    await this.del(`lockout:attempts:${normEmail}`);
    await this.del(`lockout:blocked:${normEmail}`);
  }

  async consumeJti(jti: string, ttlSeconds = 300): Promise<boolean> {
    const key = `auth:jti:${jti}`;
    return this.setNx(key, '1', ttlSeconds);
  }

  async publish(channel: string, message: string): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.publish(channel, message);
      } catch (err) {
        this.logger.warn(`Redis publish error: ${(err as Error).message}`);
      }
    }
    this.pubSubEmitter.emit(channel, message);
  }

  subscribe(channel: string, listener: (message: string) => void): () => void {
    this.pubSubEmitter.on(channel, listener);
    return () => {
      this.pubSubEmitter.off(channel, listener);
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
      this.redisClient = null;
    }
    this.inMemoryStore.clear();
  }
}
