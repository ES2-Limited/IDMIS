import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthService } from './health.service';
import type { RedisService } from '../redis/redis.service';
import type { StorageService } from '../storage/storage.service';
import type { AntivirusService } from '../storage/antivirus.service';

describe('HealthService Specification (BE-5.5)', () => {
  let service: HealthService;
  let mockRedisService: Partial<RedisService>;
  let mockStorageService: Partial<StorageService>;
  let mockAntivirusService: Partial<AntivirusService>;

  beforeEach(() => {
    mockRedisService = {
      getClient: vi.fn().mockReturnValue({
        ping: vi.fn().mockResolvedValue('PONG'),
      }),
    };

    mockStorageService = {
      checkHealth: vi.fn().mockResolvedValue(true),
    };

    mockAntivirusService = {
      checkHealth: vi.fn().mockResolvedValue(true),
    };

    service = new HealthService(
      mockRedisService as RedisService,
      mockStorageService as StorageService,
      mockAntivirusService as AntivirusService,
    );
  });

  it('reports all up when database, redis, storage, clamd, and migrations are healthy', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(true);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(true);

    const res = await service.checkAll();
    expect(res.status).toBe('ok');
    expect(res.details).toEqual({
      database: 'up',
      redis: 'up',
      storage: 'up',
      clamd: 'up',
      migrations: 'up',
    });
  });

  it('reports error when database is down', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(false);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(true);

    const res = await service.checkAll();
    expect(res.status).toBe('error');
    expect(res.details.database).toBe('down');
  });

  it('reports error when migrations are down', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(true);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(false);

    const res = await service.checkAll();
    expect(res.status).toBe('error');
    expect(res.details.migrations).toBe('down');
  });

  it('reports error when storage is down', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(true);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(true);
    mockStorageService.checkHealth = vi.fn().mockResolvedValue(false);

    const res = await service.checkAll();
    expect(res.status).toBe('error');
    expect(res.details.storage).toBe('down');
  });

  it('reports error when clamd is down', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(true);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(true);
    mockAntivirusService.checkHealth = vi.fn().mockResolvedValue(false);

    const res = await service.checkAll();
    expect(res.status).toBe('error');
    expect(res.details.clamd).toBe('down');
  });

  it('reports error when redis is down', async () => {
    vi.spyOn(service, 'checkDatabase').mockResolvedValue(true);
    vi.spyOn(service, 'checkMigrations').mockResolvedValue(true);
    mockRedisService.getClient = vi.fn().mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error('Redis connection closed')),
    });

    const res = await service.checkAll();
    expect(res.status).toBe('error');
    expect(res.details.redis).toBe('down');
  });
});
