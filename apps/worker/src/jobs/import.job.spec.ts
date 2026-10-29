import { describe, expect, it, vi } from 'vitest';
import { processImportValidationJob, type ImportJobOptions } from './import.job';

describe('Worker Import Validation Job Specification (BE-1.8)', () => {
  it('skips processing if batch is not found or not in uploaded status', async () => {
    const mockS3 = {
      send: vi.fn(),
    };

    // 1. Batch not found: limit returns []
    const mockDbNotFound = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const resNotFound = await processImportValidationJob({
      batchId: '018f3a5e-0000-7000-8000-000000000000',
      s3Client: mockS3 as unknown as NonNullable<ImportJobOptions['s3Client']>,
      bucket: 'test-bucket',
      dbClient: mockDbNotFound as unknown as NonNullable<ImportJobOptions['dbClient']>,
    });

    expect(resNotFound.status).toBe('skipped');
    expect(resNotFound.reason).toContain('Batch not in uploaded status');
    expect(mockS3.send).not.toHaveBeenCalled();

    // 2. Batch found but status is 'validated' (not 'uploaded')
    const mockDbNotUploaded = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { id: '018f3a5e-0000-7000-8000-000000000001', status: 'validated' },
              ]),
          }),
        }),
      }),
    };

    const resNotUploaded = await processImportValidationJob({
      batchId: '018f3a5e-0000-7000-8000-000000000001',
      s3Client: mockS3 as unknown as NonNullable<ImportJobOptions['s3Client']>,
      bucket: 'test-bucket',
      dbClient: mockDbNotUploaded as unknown as NonNullable<ImportJobOptions['dbClient']>,
    });

    expect(resNotUploaded.status).toBe('skipped');
    expect(resNotUploaded.reason).toBe('Batch not in uploaded status: validated');
    expect(mockS3.send).not.toHaveBeenCalled();
  });

  it('marks batch as failed if file row is missing', async () => {
    const mockS3 = {
      send: vi.fn(),
    };

    const mockUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // 1st call for batch -> returns uploaded batch; 2nd call for file -> returns []
            limit: vi
              .fn()
              .mockResolvedValueOnce([
                { id: 'batch-1', fileId: 'file-missing', status: 'uploaded' },
              ])
              .mockResolvedValueOnce([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockUpdateWhere,
        }),
      }),
    };

    const res = await processImportValidationJob({
      batchId: 'batch-1',
      s3Client: mockS3 as unknown as NonNullable<ImportJobOptions['s3Client']>,
      bucket: 'test-bucket',
      dbClient: mockDb as unknown as NonNullable<ImportJobOptions['dbClient']>,
    });

    expect(res.status).toBe('failed');
    expect(res.reason).toBe('File not found');
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});
