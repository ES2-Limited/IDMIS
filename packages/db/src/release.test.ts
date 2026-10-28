import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSeed, mockIncr, mockQuit, MockRedis } = vi.hoisted(() => {
  const mockIncr = vi.fn();
  const mockQuit = vi.fn().mockResolvedValue('OK');
  const MockRedis = vi.fn(function (this: { incr: typeof mockIncr; quit: typeof mockQuit }) {
    this.incr = mockIncr;
    this.quit = mockQuit;
  });
  const mockSeed = vi.fn();
  return { mockSeed, mockIncr, mockQuit, MockRedis };
});

vi.mock('./migrate', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./seed', () => ({
  seed: () => mockSeed(),
}));

vi.mock('ioredis', () => ({
  default: MockRedis,
}));

// Import release after mocks
import { release } from './release';

describe('Database Release (release.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('increments auth:rbac:epoch in Redis when role permissions are modified and REDIS_URL is present', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockSeed.mockResolvedValueOnce({
      rolePermsInserted: 1,
      rolePermsDeleted: 0,
    });
    mockIncr.mockResolvedValueOnce(2);

    await release();

    expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    expect(mockIncr).toHaveBeenCalledWith('auth:rbac:epoch');
    expect(mockQuit).toHaveBeenCalled();
  });

  it('does NOT touch Redis when no role permissions were inserted or deleted', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockSeed.mockResolvedValueOnce({
      rolePermsInserted: 0,
      rolePermsDeleted: 0,
    });

    await release();

    expect(MockRedis).not.toHaveBeenCalled();
    expect(mockIncr).not.toHaveBeenCalled();
  });

  it('logs and skips Redis increment when REDIS_URL is absent even if rows were modified', async () => {
    delete process.env.REDIS_URL;
    mockSeed.mockResolvedValueOnce({
      rolePermsInserted: 2,
      rolePermsDeleted: 1,
    });

    const consoleLogSpy = vi.spyOn(console, 'log');

    await release();

    expect(MockRedis).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[release] REDIS_URL absent; skipping auth:rbac:epoch increment'),
    );
  });
});
