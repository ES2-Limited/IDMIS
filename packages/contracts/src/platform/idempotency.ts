import { z } from 'zod';

/**
 * Validates Idempotency-Key header, requiring a valid UUID.
 */
export const IdempotencyKeySchema = z.uuid({
  message: 'Idempotency-Key must be a valid UUID',
});

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
