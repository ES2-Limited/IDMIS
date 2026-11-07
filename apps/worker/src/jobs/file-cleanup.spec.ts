import { describe, expect, it, vi } from 'vitest';
import { cleanupExpiredFilesJob, type FileCleanupOptions } from './file-cleanup.job';
import { file } from '@idmis/db';

describe('File Cleanup Job Specification (BE-1.7)', () => {
  it('identifies pending files older than threshold, deletes them from S3 and soft deletes in DB', async () => {
    const expiredPendingFile = {
      id: '018f3a5e-0000-7000-8000-000000000001',
      storageKey: 'files/018f3a5e-0000-7000-8000-000000000001',
      scanStatus: 'pending',
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // 30h ago
      deletedAt: null,
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([expiredPendingFile]),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: expiredPendingFile.id }]),
        }),
      }),
    };

    const mockS3Client = {
      send: vi.fn().mockResolvedValue({}),
    };

    const res = await cleanupExpiredFilesJob({
      olderThanHours: 24,
      batchSize: 50,
      dbClient: mockDb as unknown as NonNullable<FileCleanupOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<FileCleanupOptions['s3Client']>,
      bucket: 'test-bucket',
    });

    expect(res.cleanedCount).toBe(1);
    expect(res.totalFound).toBe(1);
    expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledWith(file);
  });

  it('identifies core.report files older than 7 days, deletes them from S3 and soft deletes in DB', async () => {
    const expiredReportFile = {
      id: '018f3a5e-0000-7000-8000-000000000002',
      storageKey: 'reports/018f3a5e-0000-7000-8000-000000000002.pdf',
      scanStatus: 'clean',
      ownerEntity: 'core.report',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
      deletedAt: null,
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([expiredReportFile]),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: expiredReportFile.id }]),
        }),
      }),
    };

    const mockS3Client = {
      send: vi.fn().mockResolvedValue({}),
    };

    const res = await cleanupExpiredFilesJob({
      batchSize: 50,
      dbClient: mockDb as unknown as NonNullable<FileCleanupOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<FileCleanupOptions['s3Client']>,
      bucket: 'test-bucket',
    });

    expect(res.cleanedCount).toBe(1);
    expect(res.totalFound).toBe(1);
    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: 'reports/018f3a5e-0000-7000-8000-000000000002.pdf',
        }),
      }),
    );
  });
});
