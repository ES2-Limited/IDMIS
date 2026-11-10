import { z } from 'zod';

export const ApiEnvSchema = z
  .object({
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
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    // Field-level encryption (AES-256-GCM)
    ENCRYPTION_KEY: z.string().min(32).optional(),
    ENCRYPTION_KEYS: z.string().optional(),

    // Identity HMAC Hashing (HMAC-SHA256 with key rotation)
    IDENTITY_HASH_KEY: z.string().min(32).optional(),
    IDENTITY_HASH_KEYS: z.string().optional(),

    // ClamAV Antivirus
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: z.coerce.number().default(3310),

    // Auth TOTP Enforcement
    AUTH_TOTP_ENFORCE_ADMINS: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true' || val === '1') return true;
          if (val.toLowerCase() === 'false' || val === '0') return false;
        }
        return val;
      }, z.boolean())
      .default(true),

    // M&E Compute Debounce
    ME_COMPUTE_DEBOUNCE_MS: z.coerce.number().default(60000),

    // Rate Limits (requests per window)
    RATE_LIMIT_AUTH_MAX: z.coerce.number().default(5),
    RATE_LIMIT_REFRESH_MAX: z.coerce.number().default(30),
    RATE_LIMIT_SYNC_MAX: z.coerce.number().default(60),
    RATE_LIMIT_IMPORT_MAX: z.coerce.number().default(10),
    RATE_LIMIT_DEFAULT_MAX: z.coerce.number().default(600),

    // API documentation & Swagger UI
    API_DOCS_ENABLED: z
      .preprocess((val) => {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true' || val === '1') return true;
          if (val.toLowerCase() === 'false' || val === '0') return false;
        }
        return val;
      }, z.boolean())
      .optional(),
    API_PUBLIC_BASE_PATH: z.string().default('/'),
  })
  .superRefine((data, ctx) => {
    if (data.API_DOCS_ENABLED === undefined) {
      data.API_DOCS_ENABLED = data.NODE_ENV !== 'production';
    }

    if (data.NODE_ENV === 'production') {
      if (!data.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY is required when NODE_ENV=production',
        });
      }

      if (!data.IDENTITY_HASH_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['IDENTITY_HASH_KEY'],
          message: 'IDENTITY_HASH_KEY is required when NODE_ENV=production',
        });
      }

      if (!data.CLAMAV_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CLAMAV_HOST'],
          message: 'CLAMAV_HOST is required when NODE_ENV=production',
        });
      }

      const requiredS3Vars = [
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const;

      for (const key of requiredS3Vars) {
        if (!data[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when NODE_ENV=production`,
          });
        }
      }
    } else {
      if (!data.S3_REGION) {
        data.S3_REGION = 'auto';
      }
      if (!data.S3_BUCKET) {
        data.S3_BUCKET = 'idmis-files';
      }
    }
  });

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function validateApiEnv(env: Record<string, unknown> = process.env): ApiEnv {
  return ApiEnvSchema.parse(env);
}
