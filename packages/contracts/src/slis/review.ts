import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';

export const SubmitForReviewInputSchema = z.object({
  recordIds: z.array(z.string().uuid()).min(1).max(500),
});
export type SubmitForReviewInput = z.infer<typeof SubmitForReviewInputSchema>;

export const ApproveRecordInputSchema = z.object({
  comment: z.string().max(1000).optional(),
});
export type ApproveRecordInput = z.infer<typeof ApproveRecordInputSchema>;

export const ReturnRecordInputSchema = z.object({
  comment: z.string().min(1, 'A comment explaining the return reason is required').max(1000),
});
export type ReturnRecordInput = z.infer<typeof ReturnRecordInputSchema>;

export const BulkApproveItemSchema = z.object({
  entity: z.enum([
    'farmer',
    'plot',
    'fee_collection',
    'water_request',
    'crop_production',
    'household',
    'stream_flow_reading',
  ]),
  id: z.string().uuid(),
});
export type BulkApproveItem = z.infer<typeof BulkApproveItemSchema>;

export const BulkApproveInputSchema = z.object({
  items: z.array(BulkApproveItemSchema).min(1).max(500),
});
export type BulkApproveInput = z.infer<typeof BulkApproveInputSchema>;

export const BulkApproveFailedItemSchema = z.object({
  id: z.string().uuid(),
  entity: z.string(),
  reason: z.string(),
});
export type BulkApproveFailedItem = z.infer<typeof BulkApproveFailedItemSchema>;

export const BulkApproveResponseSchema = z.object({
  succeeded: z.array(z.string().uuid()),
  failed: z.array(BulkApproveFailedItemSchema),
});
export type BulkApproveResponse = z.infer<typeof BulkApproveResponseSchema>;

export const ReviewQueueItemSchema = z.object({
  id: z.string().uuid(),
  entity: z.string(),
  schemeId: z.string().uuid(),
  stateId: z.string().uuid().nullable(),
  status: RecordStatusSchema,
  summary: z.string(),
  submittedBy: z.string().uuid().nullable(),
  submittedByName: z.string().nullable().optional(),
  submittedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;

export const ListReviewQueueQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  entity: z.string().optional(),
  status: RecordStatusSchema.optional().default('submitted'),
});
export type ListReviewQueueQuery = z.infer<typeof ListReviewQueueQuerySchema>;

export const ReviewCommentResponseSchema = z.object({
  id: z.string().uuid(),
  entity: z.string(),
  recordId: z.string().uuid(),
  action: z.enum(['submitted', 'approved', 'returned']),
  comment: z.string().nullable(),
  actorId: z.string().uuid(),
  actorName: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});
export type ReviewCommentResponse = z.infer<typeof ReviewCommentResponseSchema>;
