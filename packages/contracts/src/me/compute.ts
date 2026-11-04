import { z } from 'zod';
import { ScopeTypeSchema } from '../core/enums';

export const ComputeResultStatusSchema = z.enum(['computed', 'not_available', 'error']);
export type ComputeResultStatus = z.infer<typeof ComputeResultStatusSchema>;

export const ComputeResultSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid(),
  periodYear: z.number().int(),
  periodQuarter: z.number().int().min(1).max(4),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().nullable(),
  scopeOrgId: z.string().uuid().nullable(),
  disaggregation: z.record(z.string(), z.string()).default({}),
  status: ComputeResultStatusSchema,
  message: z.string().nullable().optional(),
  computedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ComputeResult = z.infer<typeof ComputeResultSchema>;

export const TriggerMeComputeInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4).optional(),
});
export type TriggerMeComputeInput = z.infer<typeof TriggerMeComputeInputSchema>;

export const GetIndicatorMatrixQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  scopeType: ScopeTypeSchema.optional(),
  scopeId: z.string().uuid().optional(),
});
export type GetIndicatorMatrixQuery = z.infer<typeof GetIndicatorMatrixQuerySchema>;

export const IndicatorMatrixRowSchema = z.object({
  indicatorId: z.string().uuid(),
  indicatorCode: z.string(),
  indicatorName: z.string(),
  periodYear: z.number().int(),
  periodQuarter: z.number().int().min(1).max(4),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().nullable(),
  scopeOrgId: z.string().uuid().nullable(),
  disaggregation: z.record(z.string(), z.string()).default({}),
  target: z.string().nullable().optional(),
  endTarget: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  status: z.string(), // 'computed' | 'not_available' | 'error' | 'manual' | 'pending'
  message: z.string().nullable().optional(),
  pctOfEndTarget: z.string().nullable().optional(),
  computedAt: z.string().nullable().optional(),
});
export type IndicatorMatrixRow = z.infer<typeof IndicatorMatrixRowSchema>;

export const IndicatorMatrixResponseSchema = z.object({
  items: z.array(IndicatorMatrixRowSchema),
  total: z.number().int(),
});
export type IndicatorMatrixResponse = z.infer<typeof IndicatorMatrixResponseSchema>;
