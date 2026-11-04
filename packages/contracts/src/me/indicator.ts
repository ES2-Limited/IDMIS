import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { ScopeTypeSchema } from '../core/enums';
import {
  IndicatorLevelSchema,
  IndicatorMethodSchema,
  ValueSourceSchema,
  ValueStatusSchema,
} from './enums';
import { DisaggregationSchema } from './disaggregation';

// 1. Results Framework
export const ResultsFrameworkSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  version: z.string().min(1),
  startsOn: z.string().date().nullable().optional(),
  endsOn: z.string().date().nullable().optional(),
  isCurrent: z.boolean().default(false),
  versionNumber: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type ResultsFramework = z.infer<typeof ResultsFrameworkSchema>;

export const CreateResultsFrameworkInputSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  isCurrent: z.boolean().default(false),
});

export type CreateResultsFrameworkInput = z.infer<typeof CreateResultsFrameworkInputSchema>;

// 2. Indicator
export const IndicatorSchema = z
  .object({
    id: z.string().uuid(),
    frameworkId: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    level: IndicatorLevelSchema,
    unit: z.string().min(1),
    frequency: z.string().default('annual'),
    method: IndicatorMethodSchema,
    computeKey: z.string().nullable().optional(),
    disaggregations: z.array(z.string()).default([]),
    baseline: z.string().nullable().optional(),
    baselineYear: z.number().int().nullable().optional(),
    endTarget: z.string().nullable().optional(),
    endTargetNote: z.string().nullable().optional(),
    dataSource: z.string().nullable().optional(),
    responsible: z.string().nullable().optional(),
    version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(),
    createdBy: z.string().uuid(),
    updatedAt: z.string().datetime(),
    updatedBy: z.string().uuid(),
    deletedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.method === 'computed') {
        return !!data.computeKey && data.computeKey.trim().length > 0;
      }
      if (data.method === 'manual') {
        return !data.computeKey || data.computeKey.trim().length === 0;
      }
      return true;
    },
    {
      message:
        'computeKey is required when method is computed and prohibited when method is manual',
      path: ['computeKey'],
    },
  );

export type Indicator = z.infer<typeof IndicatorSchema>;

export const CreateIndicatorInputSchema = z
  .object({
    frameworkId: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    level: IndicatorLevelSchema,
    unit: z.string().min(1),
    frequency: z.string().default('annual'),
    method: IndicatorMethodSchema,
    computeKey: z.string().nullable().optional(),
    disaggregations: z.array(z.string()).default([]),
    baseline: z.string().nullable().optional(),
    baselineYear: z.number().int().nullable().optional(),
    endTarget: z.string().nullable().optional(),
    endTargetNote: z.string().nullable().optional(),
    dataSource: z.string().nullable().optional(),
    responsible: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.method === 'computed') {
        return !!data.computeKey && data.computeKey.trim().length > 0;
      }
      if (data.method === 'manual') {
        return !data.computeKey || data.computeKey.trim().length === 0;
      }
      return true;
    },
    {
      message:
        'computeKey is required when method is computed and prohibited when method is manual',
      path: ['computeKey'],
    },
  );

export type CreateIndicatorInput = z.infer<typeof CreateIndicatorInputSchema>;

// 3. Indicator Target
export const IndicatorTargetSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid(),
  year: z.number().int(),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().nullable().optional(),
  scopeOrgId: z.string().uuid().nullable().optional(),
  value: z.string(), // numeric decimal string
  importBatchId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type IndicatorTarget = z.infer<typeof IndicatorTargetSchema>;

export const CreateIndicatorTargetInputSchema = z.object({
  indicatorId: z.string().uuid(),
  year: z.number().int(),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().optional(),
  scopeOrgId: z.string().uuid().optional(),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string'),
});

export type CreateIndicatorTargetInput = z.infer<typeof CreateIndicatorTargetInputSchema>;

export const UpdateIndicatorTargetInputSchema = z.object({
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string'),
  version: z.number().int().positive(),
});

export type UpdateIndicatorTargetInput = z.infer<typeof UpdateIndicatorTargetInputSchema>;

export const ListIndicatorTargetsQuerySchema = BaseListQuerySchema.extend({
  indicatorId: z.string().uuid().optional(),
  year: z.coerce.number().int().optional(),
  scopeType: ScopeTypeSchema.optional(),
});

export type ListIndicatorTargetsQuery = z.infer<typeof ListIndicatorTargetsQuerySchema>;

// 4. Indicator Value
export const IndicatorValueSchema = z.object({
  id: z.string().uuid(),
  indicatorId: z.string().uuid(),
  periodYear: z.number().int(),
  periodQuarter: z.number().int().min(1).max(4).nullable().optional(),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().nullable().optional(),
  scopeOrgId: z.string().uuid().nullable().optional(),
  disaggregation: DisaggregationSchema.default({}),
  value: z.string(), // decimal string
  source: ValueSourceSchema,
  computedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: ValueStatusSchema.default('draft'),
  submittedBy: z.string().uuid().nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.string().datetime().nullable().optional(),
  returnedBy: z.string().uuid().nullable().optional(),
  returnedAt: z.string().datetime().nullable().optional(),
  returnComment: z.string().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type IndicatorValue = z.infer<typeof IndicatorValueSchema>;

export const CreateIndicatorValueInputSchema = z.object({
  indicatorId: z.string().uuid(),
  periodYear: z.number().int(),
  periodQuarter: z.number().int().min(1).max(4).optional(),
  scopeType: ScopeTypeSchema,
  scopeStateId: z.string().uuid().optional(),
  scopeOrgId: z.string().uuid().optional(),
  disaggregation: DisaggregationSchema.optional(),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string'),
  notes: z.string().optional(),
  status: z.enum(['draft', 'submitted']).optional(),
});

export type CreateIndicatorValueInput = z.infer<typeof CreateIndicatorValueInputSchema>;

export const UpdateIndicatorValueInputSchema = z.object({
  value: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string')
    .optional(),
  notes: z.string().optional(),
  disaggregation: DisaggregationSchema.optional(),
  version: z.number().int().positive(),
});

export type UpdateIndicatorValueInput = z.infer<typeof UpdateIndicatorValueInputSchema>;

export const SubmitIndicatorValueInputSchema = z.object({
  version: z.number().int().positive().optional(),
});

export type SubmitIndicatorValueInput = z.infer<typeof SubmitIndicatorValueInputSchema>;

export const ApproveIndicatorValueInputSchema = z.object({
  version: z.number().int().positive().optional(),
});

export type ApproveIndicatorValueInput = z.infer<typeof ApproveIndicatorValueInputSchema>;

export const ReturnIndicatorValueInputSchema = z.object({
  comment: z.string().min(1, 'Return requires a comment'),
  version: z.number().int().positive().optional(),
});

export type ReturnIndicatorValueInput = z.infer<typeof ReturnIndicatorValueInputSchema>;

export const ListIndicatorValuesQuerySchema = BaseListQuerySchema.extend({
  indicatorId: z.string().uuid().optional(),
  periodYear: z.coerce.number().int().optional(),
  periodQuarter: z.coerce.number().int().min(1).max(4).optional(),
  status: ValueStatusSchema.optional(),
  scopeType: ScopeTypeSchema.optional(),
});

export type ListIndicatorValuesQuery = z.infer<typeof ListIndicatorValuesQuerySchema>;

// 5. Indicator Value Evidence
export const IndicatorValueEvidenceSchema = z.object({
  indicatorValueId: z.string().uuid(),
  fileId: z.string().uuid(),
});

export type IndicatorValueEvidence = z.infer<typeof IndicatorValueEvidenceSchema>;

export const AttachEvidenceInputSchema = z.object({
  fileId: z.string().uuid(),
});

export type AttachEvidenceInput = z.infer<typeof AttachEvidenceInputSchema>;
