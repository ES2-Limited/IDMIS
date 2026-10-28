import { z } from 'zod';

export const DeadEventItemSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  eventVersion: z.number().int(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.coerce.date(),
  availableAt: z.coerce.date(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  deadAt: z.coerce.date(),
});

export type DeadEventItem = z.infer<typeof DeadEventItemSchema>;

export const ListDeadEventsResponseSchema = z.object({
  items: z.array(DeadEventItemSchema),
  total: z.number().int(),
});

export type ListDeadEventsResponse = z.infer<typeof ListDeadEventsResponseSchema>;

export const RequeueEventResponseSchema = z.object({
  id: z.string().uuid(),
  requeued: z.boolean(),
  availableAt: z.coerce.date(),
});

export type RequeueEventResponse = z.infer<typeof RequeueEventResponseSchema>;
