import { z } from 'zod';

export const SampleEchoInputSchema = z.object({
  message: z.string().min(3, 'Message must be at least 3 characters long'),
  count: z.number().int().positive('Count must be a positive integer'),
});

export type SampleEchoInput = z.infer<typeof SampleEchoInputSchema>;

export const SampleEchoResponseSchema = z.object({
  echoedMessage: z.string(),
  count: z.number().int(),
  processedAt: z.string(),
});

export type SampleEchoResponse = z.infer<typeof SampleEchoResponseSchema>;
