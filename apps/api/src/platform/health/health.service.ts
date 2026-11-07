import { Injectable, Logger } from '@nestjs/common';
import { db, sql, client, areMigrationsUp } from '@idmis/db';
import type { HealthCheckDetails, HealthCheckResponse } from '@idmis/contracts';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { AntivirusService } from '../storage/antivirus.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
    private readonly antivirusService: AntivirusService,
  ) {}

  async checkDatabase(): Promise<boolean> {
    try {
      const result = await db.execute(sql`SELECT 1 as ping`);
      return Boolean(result && result.length > 0);
    } catch (err) {
      this.logger.warn(`Database health check failed: ${(err as Error).message}`);
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    try {
      const client = this.redisService.getClient();
      if (!client) {
        return process.env.NODE_ENV === 'test' || !process.env.REDIS_URL;
      }
      const pong = await client.ping();
      return pong === 'PONG';
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${(err as Error).message}`);
      return false;
    }
  }

  async checkStorage(): Promise<boolean> {
    return this.storageService.checkHealth();
  }

  async checkClamd(): Promise<boolean> {
    return this.antivirusService.checkHealth();
  }

  async checkMigrations(): Promise<boolean> {
    return areMigrationsUp(client);
  }

  async checkAll(): Promise<HealthCheckResponse> {
    const [dbUp, redisUp, storageUp, clamdUp, migrationsUp] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
      this.checkClamd(),
      this.checkMigrations(),
    ]);

    const details: HealthCheckDetails = {
      database: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      storage: storageUp ? 'up' : 'down',
      clamd: clamdUp ? 'up' : 'down',
      migrations: migrationsUp ? 'up' : 'down',
    };

    const allUp = Object.values(details).every((status) => status === 'up');

    return {
      status: allUp ? 'ok' : 'error',
      details,
    };
  }
}
