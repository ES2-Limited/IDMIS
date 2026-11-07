import { z } from 'zod';

export const RetentionRunInputSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

export type RetentionRunInput = z.infer<typeof RetentionRunInputSchema>;

export const RetentionRunResponseSchema = z.object({
  jobId: z.string(),
  dryRun: z.boolean(),
});

export type RetentionRunResponse = z.infer<typeof RetentionRunResponseSchema>;
