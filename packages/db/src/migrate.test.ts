import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, MIGRATION_ADVISORY_LOCK_ID, type RunMigrationsOptions } from './migrate';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: vi.fn().mockResolvedValue(undefined),
}));

describe('Migration Advisory Lock (migrate.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acquires and releases pg_advisory_lock with MIGRATION_ADVISORY_LOCK_ID', async () => {
    const executedQueries: string[] = [];

    const mockReserved = Object.assign(
      vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
        executedQueries.push(query.trim());
        return Promise.resolve([]);
      }),
      {
        release: vi.fn(),
      },
    );

    const mockClient = {
      reserve: vi.fn().mockResolvedValue(mockReserved),
    };

    const mockDb = {} as unknown;

    await runMigrations({
      client: mockClient as unknown as NonNullable<RunMigrationsOptions['client']>,
      db: mockDb as unknown as NonNullable<RunMigrationsOptions['db']>,
    });

    expect(mockClient.reserve).toHaveBeenCalledTimes(1);
    expect(executedQueries).toContain(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_ID})`);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(executedQueries).toContain(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_ID})`);
    expect(mockReserved.release).toHaveBeenCalledTimes(1);
  });

  it('releases advisory lock and reserved connection in finally even when migrator throws', async () => {
    const executedQueries: string[] = [];

    const mockReserved = Object.assign(
      vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
        executedQueries.push(query.trim());
        return Promise.resolve([]);
      }),
      {
        release: vi.fn(),
      },
    );

    const mockClient = {
      reserve: vi.fn().mockResolvedValue(mockReserved),
    };

    vi.mocked(migrate).mockRejectedValueOnce(new Error('Migration syntax error'));

    await expect(
      runMigrations({
        client: mockClient as unknown as NonNullable<RunMigrationsOptions['client']>,
        db: {} as unknown as NonNullable<RunMigrationsOptions['db']>,
      }),
    ).rejects.toThrow('Migration syntax error');

    expect(executedQueries).toContain(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_ID})`);
    expect(executedQueries).toContain(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_ID})`);
    expect(mockReserved.release).toHaveBeenCalledTimes(1);
  });
});
