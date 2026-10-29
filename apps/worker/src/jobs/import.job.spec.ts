import { describe, expect, it, vi } from 'vitest';
import { processImportValidationJob } from './import.job';

describe('Worker Import Validation Job Specification (BE-1.8)', () => {
  it('skips processing if batch is not found or not in uploaded status', async () => {
    const mockS3 = {
      send: vi.fn(),
    };

    const res = await processImportValidationJob({
      batchId: '018f3a5e-0000-7000-8000-000000000000',
      s3Client: mockS3 as unknown as Parameters<typeof processImportValidationJob>[0]['s3Client'],
      bucket: 'test-bucket',
    });

    expect(res.status).toBe('skipped');
  });
});
