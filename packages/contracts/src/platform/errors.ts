import { z } from 'zod';

export const ValidationErrorItemSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export type ValidationErrorItem = z.infer<typeof ValidationErrorItemSchema>;

/**
 * RFC 9457 Problem Details schema for HTTP APIs.
 * https://datatracker.ietf.org/doc/html/rfc9457
 */
export const ProblemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
  errors: z.array(ValidationErrorItemSchema).optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

/**
 * RFC 9457 Conflict Problem Details for 409 Conflict.
 * Returned when an optimistic concurrency check fails (e.g. stale version).
 */
export const ConflictProblemSchema = ProblemDetailsSchema.extend({
  status: z.literal(409).default(409),
  current: z.unknown(),
  currentVersion: z.number().int(),
});

export type ConflictProblem = z.infer<typeof ConflictProblemSchema>;
