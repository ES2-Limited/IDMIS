import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import * as net from 'node:net';
import { db, sql } from '@idmis/db';
import { Public } from './platform/auth';
import { validateApiEnv } from './platform/config/env';
import { RedisService } from './platform/redis/redis.service';
import { StorageService } from './platform/storage/storage.service';

@Controller()
export class AppController {
  constructor(
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
  ) {}

  @Public()
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  async getHealthReady(@Res() reply: FastifyReply): Promise<void> {
    const checks: Record<'postgres' | 'redis' | 'r2' | 'clamav', 'ok' | 'failed'> = {
      postgres: 'failed',
      redis: 'failed',
      r2: 'failed',
      clamav: 'failed',
    };
    const failing: string[] = [];

    const checkPostgres = async (): Promise<void> => {
      try {
        await db.execute(sql`SELECT 1`);
        checks.postgres = 'ok';
      } catch {
        checks.postgres = 'failed';
        failing.push('postgres');
      }
    };

    const checkRedis = async (): Promise<void> => {
      try {
        const ok = await this.redisService.checkHealth();
        if (ok) {
          checks.redis = 'ok';
        } else {
          checks.redis = 'failed';
          failing.push('redis');
        }
      } catch {
        checks.redis = 'failed';
        failing.push('redis');
      }
    };

    const checkR2 = async (): Promise<void> => {
      try {
        const ok = await this.storageService.checkHealth();
        if (ok) {
          checks.r2 = 'ok';
        } else {
          checks.r2 = 'failed';
          failing.push('r2');
        }
      } catch {
        checks.r2 = 'failed';
        failing.push('r2');
      }
    };

    const checkClamAv = async (): Promise<void> => {
      const { CLAMAV_HOST: host, CLAMAV_PORT: port } = validateApiEnv();
      if (!host) {
        checks.clamav = 'failed';
        failing.push('clamav');
        return;
      }

      const isAlive = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host, port });
        let resolved = false;

        socket.setTimeout(2000);

        socket.on('connect', () => {
          socket.write('PING\0');
        });

        socket.on('data', (data) => {
          if (data.toString().includes('PONG')) {
            resolved = true;
            socket.destroy();
            resolve(true);
          }
        });

        socket.on('timeout', () => {
          if (!resolved) {
            resolved = true;
            socket.destroy();
            resolve(false);
          }
        });

        socket.on('error', () => {
          if (!resolved) {
            resolved = true;
            socket.destroy();
            resolve(false);
          }
        });

        socket.on('close', () => {
          if (!resolved) {
            resolve(false);
          }
        });
      });

      if (isAlive) {
        checks.clamav = 'ok';
      } else {
        checks.clamav = 'failed';
        failing.push('clamav');
      }
    };

    await Promise.all([checkPostgres(), checkRedis(), checkR2(), checkClamAv()]);

    if (failing.length > 0) {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        status: 'error',
        failing,
        checks,
      });
      return;
    }

    reply.status(HttpStatus.OK).send({
      status: 'ok',
      checks,
    });
  }
}
