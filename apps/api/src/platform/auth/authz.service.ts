import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { db } from '@idmis/db';
import { resolveUserAuthz, UserAuthzImpl, type UserAuthz } from '@idmis/db/authz';
import type { RequestScope, CaslRule } from '@idmis/contracts';
import { RedisService } from '../redis/redis.service';

interface CachedAuthzPayload {
  userId: string;
  isActive: boolean;
  isSystemAdmin: boolean;
  permissions: string[];
  permissionScopes: Record<string, RequestScope>;
  rules: CaslRule[];
}

@Injectable()
export class AuthzService {
  private readonly logger = new Logger(AuthzService.name);

  constructor(
    @Inject(forwardRef(() => RedisService)) private readonly redisService: RedisService,
  ) {}

  async getRbacEpoch(): Promise<number> {
    const epochStr = await this.redisService.get('auth:rbac:epoch');
    if (!epochStr) {
      await this.redisService.set('auth:rbac:epoch', '1');
      return 1;
    }
    const parsed = parseInt(epochStr, 10);
    return isNaN(parsed) ? 1 : parsed;
  }

  async incrementRbacEpoch(): Promise<number> {
    return this.redisService.incr('auth:rbac:epoch');
  }

  async invalidateUser(userId: string): Promise<void> {
    const epoch = await this.getRbacEpoch();
    const cacheKey = `auth:user:${userId}:epoch:${epoch}`;
    await this.redisService.del(cacheKey);
  }

  async getUserAuthz(userId: string): Promise<UserAuthz> {
    const epoch = await this.getRbacEpoch();
    const cacheKey = `auth:user:${userId}:epoch:${epoch}`;

    // 1. Check Redis cache
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as CachedAuthzPayload;
        return new UserAuthzImpl(
          parsed.userId,
          parsed.isActive ?? true,
          parsed.isSystemAdmin,
          parsed.permissions,
          parsed.permissionScopes,
          parsed.rules,
        );
      } catch (err) {
        this.logger.warn(`Failed to parse cached authz: ${(err as Error).message}`);
      }
    }

    // 2. Compute from database using shared resolveUserAuthz
    const authz = await this.computeUserAuthz(userId);

    // 3. Store in Redis with 15-minute TTL (900 seconds)
    const payload: CachedAuthzPayload = {
      userId: authz.userId,
      isActive: authz.isActive,
      isSystemAdmin: authz.isSystemAdmin,
      permissions: authz.permissions,
      permissionScopes: authz.permissionScopes,
      rules: authz.rules,
    };

    await this.redisService.set(cacheKey, JSON.stringify(payload), 900);

    return authz;
  }

  private async computeUserAuthz(userId: string): Promise<UserAuthz> {
    return resolveUserAuthz(db, userId);
  }
}
