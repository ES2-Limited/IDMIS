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
});
