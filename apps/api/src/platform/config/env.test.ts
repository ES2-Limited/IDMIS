import { describe, it, expect } from 'vitest';
import { ApiEnvSchema, validateApiEnv } from './env';

describe('ApiEnvSchema', () => {
  it('parses valid environment with defaults', () => {
    const parsed = validateApiEnv({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/idmis',
    });
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(3000);
    expect(parsed.JWT_SECRET).toBe('development-jwt-secret-min-16-chars');
    expect(parsed.APP_URL).toBe('http://localhost:5173');
    expect(parsed.API_URL).toBe('http://localhost:3000');
  });

  it('rejects short JWT secret if provided', () => {
    expect(() =>
      ApiEnvSchema.parse({
        JWT_SECRET: 'short',
      }),
    ).toThrow();
  });

  it('parses custom port as number', () => {
    const parsed = ApiEnvSchema.parse({
      PORT: '8080',
    });
    expect(parsed.PORT).toBe(8080);
  });

  it('rejects missing ENCRYPTION_KEY when NODE_ENV=production', () => {
    expect(() =>
      ApiEnvSchema.parse({
        NODE_ENV: 'production',
        JWT_SECRET: 'production-secret-min-16-chars-long',
        IDENTITY_HASH_KEY: 'production-identity-hash-key-min-32-chars',
      }),
    ).toThrow('ENCRYPTION_KEY is required when NODE_ENV=production');
  });

  it('rejects missing IDENTITY_HASH_KEY when NODE_ENV=production', () => {
    expect(() =>
      ApiEnvSchema.parse({
        NODE_ENV: 'production',
        JWT_SECRET: 'production-secret-min-16-chars-long',
        ENCRYPTION_KEY: 'production-encryption-key-min-32-chars-long',
      }),
    ).toThrow('IDENTITY_HASH_KEY is required when NODE_ENV=production');
  });

  it('rejects missing ENCRYPTION_KEY or IDENTITY_HASH_KEY in production even if CI secret is passed', () => {
    expect(() =>
      ApiEnvSchema.parse({
        NODE_ENV: 'production',
        JWT_SECRET: 'ci-only-jwt-secret-not-used-anywhere-else',
      }),
    ).toThrow('ENCRYPTION_KEY is required when NODE_ENV=production');
  });

  it('rejects missing CLAMAV_HOST when NODE_ENV=production', () => {
    expect(() =>
      ApiEnvSchema.parse({
        NODE_ENV: 'production',
        JWT_SECRET: 'production-secret-min-16-chars-long',
        ENCRYPTION_KEY: 'production-encryption-key-min-32-chars-long',
        IDENTITY_HASH_KEY: 'production-identity-hash-key-min-32-chars',
      }),
    ).toThrow('CLAMAV_HOST is required when NODE_ENV=production');
  });

  it('defaults API_DOCS_ENABLED to true in non-production, false in production', () => {
    const devEnv = ApiEnvSchema.parse({
      NODE_ENV: 'development',
    });
    expect(devEnv.API_DOCS_ENABLED).toBe(true);
    expect(devEnv.API_PUBLIC_BASE_PATH).toBe('/');

    const prodEnv = ApiEnvSchema.parse({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-min-16-chars-long',
      ENCRYPTION_KEY: 'a'.repeat(32),
      IDENTITY_HASH_KEY: 'b'.repeat(32),
      CLAMAV_HOST: 'clamav.internal',
      S3_ENDPOINT: 'https://r2.cloudflarestorage.com',
      S3_BUCKET: 'idmis-files',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'prod-key',
      S3_SECRET_ACCESS_KEY: 'prod-secret',
    });
    expect(prodEnv.API_DOCS_ENABLED).toBe(false);

    const explicitProdDocs = ApiEnvSchema.parse({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-min-16-chars-long',
      ENCRYPTION_KEY: 'a'.repeat(32),
      IDENTITY_HASH_KEY: 'b'.repeat(32),
      CLAMAV_HOST: 'clamav.internal',
      S3_ENDPOINT: 'https://r2.cloudflarestorage.com',
      S3_BUCKET: 'idmis-files',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'prod-key',
      S3_SECRET_ACCESS_KEY: 'prod-secret',
      API_DOCS_ENABLED: 'true',
      API_PUBLIC_BASE_PATH: '/api',
    });
    expect(explicitProdDocs.API_DOCS_ENABLED).toBe(true);
    expect(explicitProdDocs.API_PUBLIC_BASE_PATH).toBe('/api');
  });

  it('handles AUTH_TOTP_ENFORCE_ADMINS default and boolean parsing', () => {
    const defaultEnv = ApiEnvSchema.parse({});
    expect(defaultEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(true);

    const falseStrEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: 'false' });
    expect(falseStrEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(false);

    const zeroStrEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: '0' });
    expect(zeroStrEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(false);

    const falseBoolEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: false });
    expect(falseBoolEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(false);

    const trueStrEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: 'true' });
    expect(trueStrEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(true);

    const oneStrEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: '1' });
    expect(oneStrEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(true);

    const trueBoolEnv = ApiEnvSchema.parse({ AUTH_TOTP_ENFORCE_ADMINS: true });
    expect(trueBoolEnv.AUTH_TOTP_ENFORCE_ADMINS).toBe(true);
  });

  describe('S3 production configuration', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-min-16-chars-long',
      ENCRYPTION_KEY: 'a'.repeat(32),
      IDENTITY_HASH_KEY: 'b'.repeat(32),
      CLAMAV_HOST: 'clamav.internal',
      S3_ENDPOINT: 'https://r2.cloudflarestorage.com',
      S3_BUCKET: 'idmis-files-prod',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'prod-access-key-id',
      S3_SECRET_ACCESS_KEY: 'prod-secret-access-key',
    };

    it('rejects missing S3_ENDPOINT when NODE_ENV=production', () => {
      const env = { ...validProdEnv };
      delete (env as Record<string, unknown>).S3_ENDPOINT;
      expect(() => ApiEnvSchema.parse(env)).toThrow(
        'S3_ENDPOINT is required when NODE_ENV=production',
      );
    });

    it('rejects missing S3_BUCKET when NODE_ENV=production', () => {
      const env = { ...validProdEnv };
      delete (env as Record<string, unknown>).S3_BUCKET;
      expect(() => ApiEnvSchema.parse(env)).toThrow(
        'S3_BUCKET is required when NODE_ENV=production',
      );
    });

    it('rejects missing S3_REGION when NODE_ENV=production', () => {
      const env = { ...validProdEnv };
      delete (env as Record<string, unknown>).S3_REGION;
      expect(() => ApiEnvSchema.parse(env)).toThrow(
        'S3_REGION is required when NODE_ENV=production',
      );
    });

    it('rejects missing S3_ACCESS_KEY_ID when NODE_ENV=production', () => {
      const env = { ...validProdEnv };
      delete (env as Record<string, unknown>).S3_ACCESS_KEY_ID;
      expect(() => ApiEnvSchema.parse(env)).toThrow(
        'S3_ACCESS_KEY_ID is required when NODE_ENV=production',
      );
    });

    it('rejects missing S3_SECRET_ACCESS_KEY when NODE_ENV=production', () => {
      const env = { ...validProdEnv };
      delete (env as Record<string, unknown>).S3_SECRET_ACCESS_KEY;
      expect(() => ApiEnvSchema.parse(env)).toThrow(
        'S3_SECRET_ACCESS_KEY is required when NODE_ENV=production',
      );
    });

    it('accepts environment in production when all 5 S3 variables are present', () => {
      const parsed = ApiEnvSchema.parse(validProdEnv);
      expect(parsed.S3_ENDPOINT).toBe('https://r2.cloudflarestorage.com');
      expect(parsed.S3_BUCKET).toBe('idmis-files-prod');
      expect(parsed.S3_REGION).toBe('auto');
      expect(parsed.S3_ACCESS_KEY_ID).toBe('prod-access-key-id');
      expect(parsed.S3_SECRET_ACCESS_KEY).toBe('prod-secret-access-key');
    });

    it('accepts environment in dev/test when none of the 5 S3 variables is present', () => {
      const devParsed = ApiEnvSchema.parse({ NODE_ENV: 'development' });
      expect(devParsed.S3_ENDPOINT).toBeUndefined();
      expect(devParsed.S3_BUCKET).toBe('idmis-files');
      expect(devParsed.S3_REGION).toBe('auto');
      expect(devParsed.S3_ACCESS_KEY_ID).toBeUndefined();
      expect(devParsed.S3_SECRET_ACCESS_KEY).toBeUndefined();

      const testParsed = ApiEnvSchema.parse({ NODE_ENV: 'test' });
      expect(testParsed.S3_ENDPOINT).toBeUndefined();
      expect(testParsed.S3_BUCKET).toBe('idmis-files');
      expect(testParsed.S3_REGION).toBe('auto');
      expect(testParsed.S3_ACCESS_KEY_ID).toBeUndefined();
      expect(testParsed.S3_SECRET_ACCESS_KEY).toBeUndefined();
    });
  });
});
