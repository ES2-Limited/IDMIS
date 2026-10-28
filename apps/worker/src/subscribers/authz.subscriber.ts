import Redis from 'ioredis';
import type { SubscriberRegistry } from '../dispatcher/registry';
import type {
  AssignmentChangedEventPayload,
  RolePermissionChangedEventPayload,
} from '@idmis/contracts';

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  quit?(): Promise<unknown>;
}

export function registerAuthzSubscribers(
  registry: SubscriberRegistry,
  redisClient?: RedisClientLike,
): void {
  const redisUrl = process.env.REDIS_URL;

  registry.register<AssignmentChangedEventPayload>(
    'core.assignment.changed',
    'authz-cache-invalidator',
    async (payload) => {
      const redis =
        redisClient ?? (redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 2 }) : null);
      if (!redis) return;
      try {
        const epochStr = await redis.get('auth:rbac:epoch');
        const epoch = epochStr ? parseInt(epochStr, 10) : 1;
        const cacheKey = `auth:user:${payload.userId}:epoch:${epoch}`;
        await redis.del(cacheKey);
        console.log(
          `[AuthzSubscriber] Evicted authz cache for user ${payload.userId} (key: ${cacheKey})`,
        );
      } finally {
        if (!redisClient && typeof redis.quit === 'function') {
          await redis.quit();
        }
      }
    },
  );

  registry.register<RolePermissionChangedEventPayload>(
    'core.role_permission.changed',
    'rbac-epoch-invalidator',
    async () => {
      const redis =
        redisClient ?? (redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 2 }) : null);
      if (!redis) return;
      try {
        const newEpoch = await redis.incr('auth:rbac:epoch');
        console.log(`[AuthzSubscriber] Incremented auth:rbac:epoch to ${newEpoch}`);
      } finally {
        if (!redisClient && typeof redis.quit === 'function') {
          await redis.quit();
        }
      }
    },
  );
}
