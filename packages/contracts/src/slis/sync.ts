import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import {
  QuarantineReasonSchema,
  SyncConflictResolutionSchema,
  SyncOpActionSchema,
  SyncOutcomeSchema,
  SyncQuarantineResolutionSchema,
} from './enums';

/**
 * Composite Safe Watermark Cursor: "${xid}:${seq}".
 * Guarantees zero missed transactions regardless of interleaving commits.
 */
export const SyncCursorSchema = z
  .string()
  .regex(/^\d+:\d+$/, 'Cursor must be in composite format xid:seq (e.g. "10452:389")');
export type SyncCursor = z.infer<typeof SyncCursorSchema>;

// --- Push Operation ---
export const SyncOpItemSchema = z.object({
  opId: z.string().uuid(),
  entity: z.string().min(1),
  action: SyncOpActionSchema,
  recordId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
});
export type SyncOpItem = z.infer<typeof SyncOpItemSchema>;

export const SyncPushInputSchema = z.object({
  deviceId: z.string().uuid(),
  ops: z.array(SyncOpItemSchema).min(1).max(500),
});
export type SyncPushInput = z.infer<typeof SyncPushInputSchema>;

export const SyncOpErrorSchema = z.object({
  status: z.number().int(),
  detail: z.string(),
  field: z.string().optional(),
});
export type SyncOpError = z.infer<typeof SyncOpErrorSchema>;

export const SyncOpResultSchema = z.object({
  opId: z.string().uuid(),
  entity: z.string(),
  recordId: z.string().uuid(),
  outcome: SyncOutcomeSchema,
  newVersion: z.number().int().positive().optional(),
  conflictId: z.string().uuid().optional(),
  quarantineId: z.string().uuid().optional(),
  quarantineReason: QuarantineReasonSchema.optional(),
  errors: z.array(SyncOpErrorSchema).optional(),
});
export type SyncOpResult = z.infer<typeof SyncOpResultSchema>;

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncOpResultSchema),
  serverTime: z.iso.datetime(),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

// --- Pull Operations ---
export const SyncPullQuerySchema = z.object({
  cursor: SyncCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

export const SyncPullChangeItemSchema = z.object({
  xid: z.string(),
  seq: z.number().int(),
  entity: z.string(),
  recordId: z.string().uuid(),
  op: z.enum(['upsert', 'delete']),
  schemeId: z.string().uuid().nullable(),
  stateId: z.string().uuid().nullable(),
  data: z.record(z.string(), z.unknown()).optional(), // Stripped of identity ciphertext and full bank numbers!
  deleted: z.boolean().optional(),
});
export type SyncPullChangeItem = z.infer<typeof SyncPullChangeItemSchema>;

export const SyncPullResponseSchema = z.object({
  items: z.array(SyncPullChangeItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  rebaseline: z.boolean().optional(),
  activeSchemeIds: z.array(z.string().uuid()).optional(),
  activeStateIds: z.array(z.string().uuid()).optional(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

// --- Sync Conflicts ---
export const SyncConflictResponseSchema = z.object({
  id: z.string().uuid(),
  opId: z.string().uuid(),
  entity: z.string(),
  recordId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
  serverVersion: z.number().int().positive(),
  devicePayload: z.record(z.string(), z.unknown()),
  serverPayload: z.record(z.string(), z.unknown()),
  status: z.enum(['open', 'resolved']),
  schemeId: z.string().uuid().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type SyncConflictResponse = z.infer<typeof SyncConflictResponseSchema>;

export const ResolveConflictInputSchema = z.object({
  resolution: SyncConflictResolutionSchema,
  mergedData: z.record(z.string(), z.unknown()).optional(),
});
export type ResolveConflictInput = z.infer<typeof ResolveConflictInputSchema>;

export const ListSyncConflictsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  entity: z.string().optional(),
  status: z.enum(['open', 'resolved']).optional().default('open'),
});
export type ListSyncConflictsQuery = z.infer<typeof ListSyncConflictsQuerySchema>;

// --- Sync Quarantine ---
export const SyncQuarantineResponseSchema = z.object({
  id: z.string().uuid(),
  opId: z.string().uuid(),
  deviceId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: QuarantineReasonSchema,
  entity: z.string(),
  recordId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  quarantinedAt: z.iso.datetime(),
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  resolution: SyncQuarantineResolutionSchema.nullable(),
});
export type SyncQuarantineResponse = z.infer<typeof SyncQuarantineResponseSchema>;

export const ResolveQuarantineInputSchema = z.object({
  resolution: SyncQuarantineResolutionSchema,
});
export type ResolveQuarantineInput = z.infer<typeof ResolveQuarantineInputSchema>;

export const ListSyncQuarantineQuerySchema = BaseListQuerySchema.extend({
  deviceId: z.string().uuid().optional(),
  reason: QuarantineReasonSchema.optional(),
  status: z.enum(['pending', 'resolved']).optional().default('pending'),
});
export type ListSyncQuarantineQuery = z.infer<typeof ListSyncQuarantineQuerySchema>;
