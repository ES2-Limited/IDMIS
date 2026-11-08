import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AppController } from './app.controller';
import type { RedisService } from './platform/redis/redis.service';
import type { StorageService } from './platform/storage/storage.service';
import { db } from '@idmis/db';

vi.mock('@idmis/db', () => ({
  db: {
    execute: vi.fn(),
  },
  sql: vi.fn(),
}));

interface HealthResponseBody {
  status: string;
  checks: Record<string, string>;
  failing?: string[];
}

function createMockReply(): {
  reply: FastifyReply;
  getStatus: () => number;
  getBody: () => HealthResponseBody | null;
} {
  let statusCode = 200;
  let responseBody: HealthResponseBody | null = null;
  const reply = {
    status: (code: number) => {
      statusCode = code;
      return {
        send: (body: HealthResponseBody) => {
          responseBody = body;
        },
      };
    },
  } as unknown as FastifyReply;

  return {
    reply,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  };
}

describe('AppController', () => {
  let mockRedisService: Partial<RedisService>;
  let mockStorageService: Partial<StorageService>;
  let clamServer: net.Server | null = null;
  let clamPort = 33100;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisService = {
      checkHealth: vi.fn().mockResolvedValue(true),
    };
    mockStorageService = {
      checkHealth: vi.fn().mockResolvedValue(true),
    };
    (db.execute as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(async () => {
    if (clamServer) {
      await new Promise<void>((resolve) => clamServer!.close(() => resolve()));
      clamServer = null;
    }
  });

  it('returns liveness status from /health', () => {
    const controller = new AppController(
      mockRedisService as RedisService,
      mockStorageService as StorageService,
    );
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when all dependencies (Postgres, Redis, R2, ClamAV) are healthy', async () => {
      // Start mock ClamAV server responding with PONG
      await new Promise<void>((resolve) => {
        clamServer = net.createServer((socket) => {
          socket.on('data', () => {
            socket.write('PONG\0');
          });
        });
        clamServer.listen(0, '127.0.0.1', () => {
          const addr = clamServer!.address() as net.AddressInfo;
          clamPort = addr.port;
          process.env.CLAMAV_HOST = '127.0.0.1';
          process.env.CLAMAV_PORT = String(clamPort);
          resolve();
        });
      });

      const controller = new AppController(
        mockRedisService as RedisService,
        mockStorageService as StorageService,
      );

      const mock = createMockReply();
      await controller.getHealthReady(mock.reply);

      expect(mock.getStatus()).toBe(HttpStatus.OK);
      expect(mock.getBody()).toEqual({
        status: 'ok',
        checks: {
          postgres: 'ok',
          redis: 'ok',
          r2: 'ok',
          clamav: 'ok',
        },
      });
    });

    it('returns 503 naming clamav when ClamAV is unreachable', async () => {
      // Point ClamAV to an unreachable port
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = '59998';

      const controller = new AppController(
        mockRedisService as RedisService,
        mockStorageService as StorageService,
      );

      const mock = createMockReply();
      await controller.getHealthReady(mock.reply);

      expect(mock.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = mock.getBody();
      expect(body?.status).toBe('error');
      expect(body?.failing).toContain('clamav');
      expect(body?.checks.clamav).toBe('failed');
      expect(body?.checks.postgres).toBe('ok');
      expect(body?.checks.redis).toBe('ok');
      expect(body?.checks.r2).toBe('ok');
    });

    it('returns 503 naming postgres when database fails', async () => {
      (db.execute as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('connection terminated'),
      );

      // Start mock ClamAV server responding with PONG
      await new Promise<void>((resolve) => {
        clamServer = net.createServer((socket) => {
          socket.on('data', () => {
            socket.write('PONG\0');
          });
        });
        clamServer.listen(0, '127.0.0.1', () => {
          const addr = clamServer!.address() as net.AddressInfo;
          clamPort = addr.port;
          process.env.CLAMAV_HOST = '127.0.0.1';
          process.env.CLAMAV_PORT = String(clamPort);
          resolve();
        });
      });

      const controller = new AppController(
        mockRedisService as RedisService,
        mockStorageService as StorageService,
      );

      const mock = createMockReply();
      await controller.getHealthReady(mock.reply);

      expect(mock.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = mock.getBody();
      expect(body?.status).toBe('error');
      expect(body?.failing).toContain('postgres');
      expect(body?.checks.postgres).toBe('failed');
    });

    it('returns 503 naming redis and r2 when both fail', async () => {
      mockRedisService.checkHealth = vi.fn().mockResolvedValue(false);
      mockStorageService.checkHealth = vi.fn().mockResolvedValue(false);

      // Start mock ClamAV server responding with PONG
      await new Promise<void>((resolve) => {
        clamServer = net.createServer((socket) => {
          socket.on('data', () => {
            socket.write('PONG\0');
          });
        });
        clamServer.listen(0, '127.0.0.1', () => {
          const addr = clamServer!.address() as net.AddressInfo;
          clamPort = addr.port;
          process.env.CLAMAV_HOST = '127.0.0.1';
          process.env.CLAMAV_PORT = String(clamPort);
          resolve();
        });
      });

      const controller = new AppController(
        mockRedisService as RedisService,
        mockStorageService as StorageService,
      );

      const mock = createMockReply();
      await controller.getHealthReady(mock.reply);

      expect(mock.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = mock.getBody();
      expect(body?.status).toBe('error');
      expect(body?.failing).toEqual(expect.arrayContaining(['redis', 'r2']));
      expect(body?.checks.redis).toBe('failed');
      expect(body?.checks.r2).toBe('failed');
      expect(body?.checks.postgres).toBe('ok');
      expect(body?.checks.clamav).toBe('ok');
    });

    it('returns 503 naming clamav when CLAMAV_HOST is unset (no 127.0.0.1 fallback)', async () => {
      const originalHost = process.env.CLAMAV_HOST;
      try {
        delete process.env.CLAMAV_HOST;

        const controller = new AppController(
          mockRedisService as RedisService,
          mockStorageService as StorageService,
        );

        const mock = createMockReply();
        await controller.getHealthReady(mock.reply);

        expect(mock.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const body = mock.getBody();
        expect(body?.status).toBe('error');
        expect(body?.failing).toContain('clamav');
        expect(body?.checks.clamav).toBe('failed');
      } finally {
        if (originalHost) {
          process.env.CLAMAV_HOST = originalHost;
        }
      }
    });
  });
});
