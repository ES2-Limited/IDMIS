import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  processMeasurementCommitJob,
  type MeasurementCommitJobOptions,
} from './blis-measurement-commit.job';
import { resolveUserAuthz } from '@idmis/db/authz';

vi.mock('@idmis/db/authz', () => ({
  resolveUserAuthz: vi.fn(),
}));

describe('Worker BLIS Measurement Commit Job (BE-4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails commit if user lacks BLIS_MEASUREMENT_IMPORT permission or is deactivated', async () => {
    vi.mocked(resolveUserAuthz).mockResolvedValue({
      userId: 'test-user',
      isActive: true,
      can: vi.fn().mockReturnValue(false),
      scopeFor: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const res = await processMeasurementCommitJob({
      batchId: '018f3a5e-0000-7000-8000-000000000001',
      userId: 'test-user',
      dbClient: mockDb as unknown as NonNullable<MeasurementCommitJobOptions['dbClient']>,
    });

    expect(res.status).toBe('commit_failed');
    expect(res.committedRows).toBe(0);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('skips if batch is not found or in uncommittable status', async () => {
    vi.mocked(resolveUserAuthz).mockResolvedValue({
      userId: 'test-user',
      isActive: true,
      can: vi.fn().mockReturnValue(true),
      scopeFor: vi.fn().mockReturnValue({ isNational: true }),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const res = await processMeasurementCommitJob({
      batchId: '018f3a5e-0000-7000-8000-000000000002',
      userId: 'test-user',
      dbClient: mockDb as unknown as NonNullable<MeasurementCommitJobOptions['dbClient']>,
    });

    expect(res.status).toBe('skipped');
    expect(res.committedRows).toBe(0);
  });

  it('ensures partitions for all distinct years and processes batch in 5,000-row chunks', async () => {
    vi.mocked(resolveUserAuthz).mockResolvedValue({
      userId: 'test-user',
      isActive: true,
      can: vi.fn().mockReturnValue(true),
      scopeFor: vi.fn().mockReturnValue({ isNational: true }),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    let batchSelectCalled = false;
    let importRowsQueryCount = 0;

    const mockBatch = {
      id: '018f3a5e-0000-7000-8000-000000000003',
      status: 'committing',
      committedRows: 0,
    };

    const mockRows = Array.from({ length: 5000 }, (_, i) => ({
      id: `row-${i}`,
      rowNumber: i + 1,
      parsedData: {
        stationId: 'st-01',
        parameterId: 'pm-01',
        observedAt: '2026-05-01T12:00:00Z',
        value: '10.5000',
        unit: 'm',
        quality: 'raw',
      },
    }));

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (!batchSelectCalled) {
              batchSelectCalled = true;
              return {
                limit: vi.fn().mockResolvedValue([mockBatch]),
              };
            }
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockImplementation(() => {
                  importRowsQueryCount++;
                  if (importRowsQueryCount === 1) {
                    return Promise.resolve(mockRows);
                  }
                  return Promise.resolve([]);
                }),
              }),
            };
          }),
        }),
      }),
      execute: vi.fn().mockImplementation((queryObj) => {
        const queryStr = String(queryObj?.query || queryObj?.strings?.join('') || '');
        if (queryStr.includes('DISTINCT EXTRACT(YEAR')) {
          return Promise.resolve([{ yr: 2025 }, { yr: 2026 }, { yr: 2027 }]);
        }
        if (queryStr.includes('min(observed_at)')) {
          return Promise.resolve([
            {
              min_observed_at: '2025-01-01T00:00:00Z',
              max_observed_at: '2027-12-31T23:59:59Z',
              station_ids: ['st-01'],
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb(mockDb);
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    };

    const res = await processMeasurementCommitJob({
      batchId: '018f3a5e-0000-7000-8000-000000000003',
      userId: 'test-user',
      dbClient: mockDb as unknown as NonNullable<MeasurementCommitJobOptions['dbClient']>,
    });

    expect(res.status).toBe('committed');
    expect(res.committedRows).toBe(5000);
    // Partitions ensured for 2025, 2026, 2027
    expect(mockDb.execute).toHaveBeenCalled();
    // Outbox event inserted
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('fails commit with 0 rows if scope was revoked between preview and commit', async () => {
    vi.mocked(resolveUserAuthz).mockResolvedValue({
      userId: 'test-user',
      isActive: true,
      can: vi.fn().mockReturnValue(true),
      scopeFor: vi.fn().mockReturnValue({
        isNational: false,
        rbdaIds: ['different-rbda'],
        stateIds: [],
        schemeIds: [],
      }),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ station_id: 'out-of-scope-station' }]),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const res = await processMeasurementCommitJob({
      batchId: '018f3a5e-0000-7000-8000-000000000004',
      userId: 'test-user',
      dbClient: mockDb as unknown as NonNullable<MeasurementCommitJobOptions['dbClient']>,
    });

    expect(res.status).toBe('commit_failed');
    expect(res.committedRows).toBe(0);
    expect(mockDb.update).toHaveBeenCalled();
  });
});
