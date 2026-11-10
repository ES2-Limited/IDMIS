import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWorkerS3Config } from './storage';

describe('getWorkerS3Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('preserves dev/test defaults when S3 variables are not set', () => {
    delete process.env.NODE_ENV;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;

    const config = getWorkerS3Config();
    expect(config.bucket).toBe('idmis-files');
  });

  describe('production validation', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
      process.env.S3_BUCKET = 'idmis-files-prod';
      process.env.S3_REGION = 'auto';
      process.env.S3_ACCESS_KEY_ID = 'prod-access-key';
      process.env.S3_SECRET_ACCESS_KEY = 'prod-secret-key';
    });

    it('throws when S3_ENDPOINT is missing in production', () => {
      delete process.env.S3_ENDPOINT;
      expect(() => getWorkerS3Config()).toThrow('S3_ENDPOINT is required when NODE_ENV=production');
    });

    it('throws when S3_BUCKET is missing in production', () => {
      delete process.env.S3_BUCKET;
      expect(() => getWorkerS3Config()).toThrow('S3_BUCKET is required when NODE_ENV=production');
    });

    it('throws when S3_REGION is missing in production', () => {
      delete process.env.S3_REGION;
      expect(() => getWorkerS3Config()).toThrow('S3_REGION is required when NODE_ENV=production');
    });

    it('throws when S3_ACCESS_KEY_ID is missing in production', () => {
      delete process.env.S3_ACCESS_KEY_ID;
      expect(() => getWorkerS3Config()).toThrow(
        'S3_ACCESS_KEY_ID is required when NODE_ENV=production',
      );
    });

    it('throws when S3_SECRET_ACCESS_KEY is missing in production', () => {
      delete process.env.S3_SECRET_ACCESS_KEY;
      expect(() => getWorkerS3Config()).toThrow(
        'S3_SECRET_ACCESS_KEY is required when NODE_ENV=production',
      );
    });

    it('returns s3Client and bucket when all 5 variables are present', () => {
      const config = getWorkerS3Config();
      expect(config.bucket).toBe('idmis-files-prod');
      expect(config.s3Client).toBeDefined();
    });
  });
});
