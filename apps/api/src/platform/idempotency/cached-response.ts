import { z } from 'zod';

export const CachedResponseSchema = z.object({
  statusCode: z.number().int(),
  headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  body: z.unknown(),
  cachedAt: z.string(),
  requestBodyHash: z.string(),
});

export type CachedResponse = z.infer<typeof CachedResponseSchema>;
