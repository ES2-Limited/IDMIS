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
      }),
    ).toThrow('ENCRYPTION_KEY is required when NODE_ENV=production');
  });

  it('provides fallback ENCRYPTION_KEY during CI smoke test when JWT_SECRET is ci-only', () => {
    const parsed = ApiEnvSchema.parse({
      NODE_ENV: 'production',
      JWT_SECRET: 'ci-only-jwt-secret-not-used-anywhere-else',
    });
    expect(parsed.ENCRYPTION_KEY).toBe('ci-only-encryption-key-for-docker-smoke-test-32bytes');
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
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    });
    expect(prodEnv.API_DOCS_ENABLED).toBe(false);

    const explicitProdDocs = ApiEnvSchema.parse({
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret-min-16-chars-long',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      API_DOCS_ENABLED: 'true',
      API_PUBLIC_BASE_PATH: '/api',
    });
    expect(explicitProdDocs.API_DOCS_ENABLED).toBe(true);
    expect(explicitProdDocs.API_PUBLIC_BASE_PATH).toBe('/api');
  });
});
