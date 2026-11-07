import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppController } from './app.controller';
import type { HealthService } from './platform/health/health.service';
import type { FastifyReply } from 'fastify';

describe('AppController Deep Health Check Specification (BE-5.5)', () => {
  let controller: AppController;
  let mockHealthService: Partial<HealthService>;
  let mockReply: Partial<FastifyReply>;
  let statusCode: number;

  beforeEach(() => {
    statusCode = 200;
    mockReply = {
      status: vi.fn((code: number) => {
        statusCode = code;
        return mockReply as FastifyReply;
      }),
    };

    mockHealthService = {
      checkAll: vi.fn().mockResolvedValue({
        status: 'ok',
        details: {
          database: 'up',
          redis: 'up',
          storage: 'up',
          clamd: 'up',
          migrations: 'up',
        },
      }),
    };

    controller = new AppController(mockHealthService as HealthService);
  });

  it('returns 200 with status "ok" and all dependencies "up" when healthy', async () => {
    const res = await controller.getHealth(mockReply as FastifyReply);

    expect(statusCode).toBe(200);
    expect(res).toEqual({
      status: 'ok',
      details: {
        database: 'up',
        redis: 'up',
        storage: 'up',
        clamd: 'up',
        migrations: 'up',
      },
    });
    expect(mockReply.status).not.toHaveBeenCalled();
  });

  it('returns 503 with status "error" when any dependency is down', async () => {
    mockHealthService.checkAll = vi.fn().mockResolvedValue({
      status: 'error',
      details: {
        database: 'down',
        redis: 'up',
        storage: 'up',
        clamd: 'up',
        migrations: 'up',
      },
    });

    const res = await controller.getHealth(mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(res.status).toBe('error');
    expect(res.details.database).toBe('down');
  });

  it('returns 503 with status "error" when redis or storage is down', async () => {
    mockHealthService.checkAll = vi.fn().mockResolvedValue({
      status: 'error',
      details: {
        database: 'up',
        redis: 'down',
        storage: 'down',
        clamd: 'up',
        migrations: 'up',
      },
    });

    const res = await controller.getHealth(mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(503);
    expect(res.status).toBe('error');
    expect(res.details.redis).toBe('down');
    expect(res.details.storage).toBe('down');
  });
});
