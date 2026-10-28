import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'approve',
  'return',
  'import',
  'revert',
  'sign_in',
  'sign_in_failed',
  'lockout',
  'password_change',
  'password_reset',
  'totp_enrol',
  'totp_verify',
  'assign',
  'deassign',
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const ActorTypeSchema = z.enum(['user', 'system', 'worker']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const AuditRecordSchema = z.object({
  id: z.string().uuid().optional(),
  occurredAt: z.coerce.date().optional(),
  actorType: ActorTypeSchema,
  actorUserId: z.string().uuid().nullable().optional(),
  requestId: z.string().nullable().optional(),
  action: AuditActionSchema,
  entityType: z.string().min(1),
  entityId: z.string().nullable().optional(),
  stateId: z.string().uuid().nullable().optional(),
  changes: z
    .object({
      before: z.unknown().optional(),
      after: z.unknown().optional(),
    })
    .nullable()
    .optional(),
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});

export type AuditRecord = z.infer<typeof AuditRecordSchema>;
