import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processBlisPartitionJob } from './blis-partition.job';
import { db } from '@idmis/db';

vi.mock('@idmis/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@idmis/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      execute: vi.fn().mockResolvedValue([]),
    },
  };
});

describe('BLIS Measurement Partition Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensures partition for next year by default', async () => {
    const currentYear = new Date().getFullYear();
    const result = await processBlisPartitionJob();

    expect(result.year).toBe(currentYear + 1);
    expect(result.status).toBe('success');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('ensures partition for specified year when provided', async () => {
    const result = await processBlisPartitionJob({ year: 2029 });

    expect(result.year).toBe(2029);
    expect(result.status).toBe('success');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
