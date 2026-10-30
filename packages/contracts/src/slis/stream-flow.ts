import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { FlowRateSchema, SlisReviewableColumnsSchema } from './common';

export const RecordStreamFlowInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  stationId: z.string().uuid(),
  readAt: z.iso.datetime(),
  value: FlowRateSchema,
  unit: z.string().min(1).max(20).default('m3/s'),
});
export type RecordStreamFlowInput = z.infer<typeof RecordStreamFlowInputSchema>;

export const StreamFlowReadingResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  stationId: z.string().uuid(),
  readAt: z.iso.datetime(),
  value: FlowRateSchema,
  unit: z.string(),
});
export type StreamFlowReadingResponse = z.infer<typeof StreamFlowReadingResponseSchema>;

export const ListStreamFlowReadingsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional(),
  fromReadAt: z.iso.datetime().optional(),
  toReadAt: z.iso.datetime().optional(),
  status: RecordStatusSchema.optional(),
});
export type ListStreamFlowReadingsQuery = z.infer<typeof ListStreamFlowReadingsQuerySchema>;
