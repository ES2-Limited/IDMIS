import { z } from 'zod';

export const KNOWN_EVENT_TYPES = [
  'core.assignment.changed',
  'core.role_permission.changed',
  'core.user.created',
  'core.user.updated',
  'core.user.deactivated',
  'core.file.uploaded',
  'core.file.scanned',
  'core.file.deleted',
  'core.import.uploaded',
  'core.import.validated',
  'core.import.committed',
  'core.import.undone',
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

// Assignment Changed
export const AssignmentChangedEventPayloadSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  module: z.string().optional(),
  scopeType: z.string().optional(),
  changeType: z.enum(['created', 'updated', 'deleted']),
});
export type AssignmentChangedEventPayload = z.infer<typeof AssignmentChangedEventPayloadSchema>;

// Role Permission Changed
export const RolePermissionChangedEventPayloadSchema = z.object({
  roleId: z.string().uuid(),
  roleKey: z.string().optional(),
  changeType: z.enum(['reconciled', 'updated']),
});
export type RolePermissionChangedEventPayload = z.infer<
  typeof RolePermissionChangedEventPayloadSchema
>;

// File Events
export const FileUploadedEventPayloadSchema = z.object({
  fileId: z.string().uuid(),
  storageKey: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  ownerEntity: z.string().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  uploadedBy: z.string().uuid().optional(),
});
export type FileUploadedEventPayload = z.infer<typeof FileUploadedEventPayloadSchema>;

export const FileScannedEventPayloadSchema = z.object({
  fileId: z.string().uuid(),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'failed']),
  virusDetails: z.string().nullable().optional(),
});
export type FileScannedEventPayload = z.infer<typeof FileScannedEventPayloadSchema>;

export const FileDeletedEventPayloadSchema = z.object({
  fileId: z.string().uuid(),
  storageKey: z.string(),
  deletedBy: z.string().uuid().optional(),
});
export type FileDeletedEventPayload = z.infer<typeof FileDeletedEventPayloadSchema>;

// Import Events
export const ImportUploadedEventPayloadSchema = z.object({
  batchId: z.string().uuid(),
  dataset: z.string(),
  fileId: z.string().uuid(),
  schemeId: z.string().uuid().nullable().optional(),
  stateId: z.string().uuid().nullable().optional(),
  uploadedBy: z.string().uuid().optional(),
});
export type ImportUploadedEventPayload = z.infer<typeof ImportUploadedEventPayloadSchema>;

export const ImportValidatedEventPayloadSchema = z.object({
  batchId: z.string().uuid(),
  dataset: z.string(),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  errorRows: z.number().int().nonnegative(),
  status: z.enum(['validated', 'validation_failed']),
});
export type ImportValidatedEventPayload = z.infer<typeof ImportValidatedEventPayloadSchema>;

export const ImportCommittedEventPayloadSchema = z.object({
  batchId: z.string().uuid(),
  dataset: z.string(),
  committedRows: z.number().int().nonnegative(),
  status: z.enum(['committed', 'commit_failed']),
  committedBy: z.string().uuid().optional(),
});
export type ImportCommittedEventPayload = z.infer<typeof ImportCommittedEventPayloadSchema>;

export const ImportUndoneEventPayloadSchema = z.object({
  batchId: z.string().uuid(),
  dataset: z.string(),
  status: z.enum(['undone', 'undo_failed']),
  undoneBy: z.string().uuid().optional(),
});
export type ImportUndoneEventPayload = z.infer<typeof ImportUndoneEventPayloadSchema>;
