import { z } from 'zod';

export const KNOWN_EVENT_TYPES = [
  'core.assignment.changed',
  'core.role_permission.changed',
  'core.user.created',
  'core.user.updated',
  'core.user.deactivated',
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

export const KnownEventTypeSchema = z.enum(KNOWN_EVENT_TYPES);

export const EventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string().min(1),
  eventVersion: z.number().int().positive().default(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.coerce.date(),
});

export type EventEnvelope<T = Record<string, unknown>> = Omit<
  z.infer<typeof EventEnvelopeSchema>,
  'payload'
> & {
  payload: T;
};

export const AssignmentChangedEventPayloadSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  module: z.string().optional(),
  scopeType: z.string().optional(),
  changeType: z.enum(['created', 'updated', 'deleted']),
});

export type AssignmentChangedEventPayload = z.infer<typeof AssignmentChangedEventPayloadSchema>;

export const RolePermissionChangedEventPayloadSchema = z.object({
  roleId: z.string().uuid(),
  roleKey: z.string().optional(),
  changeType: z.enum(['reconciled', 'updated']),
});

export type RolePermissionChangedEventPayload = z.infer<
  typeof RolePermissionChangedEventPayloadSchema
>;
