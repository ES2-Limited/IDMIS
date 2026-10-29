import { z } from 'zod';

export const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1).default('postgresql://idmis:idmis@localhost:5432/idmis'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16).default('development-jwt-secret-min-16-chars'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_PATH: z.string().default('/auth'),

  // MinIO / S3 object storage
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('idmis-files'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Field-level encryption (AES-256-GCM)
  ENCRYPTION_KEY: z.string().min(32).default('0123456789abcdef0123456789abcdef'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function validateApiEnv(env: Record<string, unknown> = process.env): ApiEnv {
  return ApiEnvSchema.parse(env);
}
