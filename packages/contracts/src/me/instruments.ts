import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';

// -------------------------------------------------------------
// 1. Scorecard
// -------------------------------------------------------------
export const ScorecardSchema = z.object({
  id: z.string().uuid(),
  schemeId: z.string().uuid(),
  periodYear: z.number().int(),
  publishedOn: z.string().date().nullable().optional(),
  fileId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type Scorecard = z.infer<typeof ScorecardSchema>;

export const CreateScorecardInputSchema = z.object({
  id: z.string().uuid().optional(),
  schemeId: z.string().uuid(),
  periodYear: z.number().int(),
  publishedOn: z.string().date().optional(),
  fileId: z.string().uuid().optional(),
});

export type CreateScorecardInput = z.infer<typeof CreateScorecardInputSchema>;

export const UpdateScorecardInputSchema = z.object({
  schemeId: z.string().uuid().optional(),
  periodYear: z.number().int().optional(),
  publishedOn: z.string().date().optional(),
  fileId: z.string().uuid().optional(),
  version: z.number().int().positive(),
});

export type UpdateScorecardInput = z.infer<typeof UpdateScorecardInputSchema>;

export const ListScorecardsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  periodYear: z.coerce.number().int().optional(),
});

export type ListScorecardsQuery = z.infer<typeof ListScorecardsQuerySchema>;

// -------------------------------------------------------------
// 2. Matching Grant
// -------------------------------------------------------------
export const MatchingGrantSchema = z.object({
  id: z.string().uuid(),
  schemeId: z.string().uuid(),
  wuaId: z.string().uuid().nullable().optional(),
  purpose: z.string().nullable().optional(),
  amountNgn: z.string().nullable().optional(), // decimal string
  approvedOn: z.string().date().nullable().optional(),
  disbursedOn: z.string().date().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type MatchingGrant = z.infer<typeof MatchingGrantSchema>;

export const CreateMatchingGrantInputSchema = z.object({
  id: z.string().uuid().optional(),
  schemeId: z.string().uuid(),
  wuaId: z.string().uuid().optional(),
  purpose: z.string().optional(),
  amountNgn: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid currency decimal string'),
  approvedOn: z.string().date().optional(),
  disbursedOn: z.string().date().optional(),
});

export type CreateMatchingGrantInput = z.infer<typeof CreateMatchingGrantInputSchema>;

export const UpdateMatchingGrantInputSchema = z.object({
  schemeId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
  purpose: z.string().optional(),
  amountNgn: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid currency decimal string')
    .optional(),
  approvedOn: z.string().date().optional(),
  disbursedOn: z.string().date().optional(),
  version: z.number().int().positive(),
});

export type UpdateMatchingGrantInput = z.infer<typeof UpdateMatchingGrantInputSchema>;

export const ListMatchingGrantsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
});

export type ListMatchingGrantsQuery = z.infer<typeof ListMatchingGrantsQuerySchema>;

// -------------------------------------------------------------
// 3. Tech Adoption
// -------------------------------------------------------------
export const TechAdoptionGenderSchema = z.enum(['female', 'male']);
export type TechAdoptionGender = z.infer<typeof TechAdoptionGenderSchema>;

export const TechAdoptionSchema = z.object({
  id: z.string().uuid(),
  schemeId: z.string().uuid(),
  farmerId: z.string().uuid().nullable().optional(),
  technologyId: z.string().uuid(),
  gender: TechAdoptionGenderSchema,
  adoptedOn: z.string().date().nullable().optional(),
  status: z.string().default('submitted'),
  submittedAt: z.string().datetime().nullable().optional(),
  submittedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.string().datetime().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  returnedAt: z.string().datetime().nullable().optional(),
  returnedBy: z.string().uuid().nullable().optional(),
  returnComment: z.string().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type TechAdoption = z.infer<typeof TechAdoptionSchema>;

export const ApproveTechAdoptionInputSchema = z.object({
  version: z.number().int().positive().optional(),
});
export type ApproveTechAdoptionInput = z.infer<typeof ApproveTechAdoptionInputSchema>;

export const ReturnTechAdoptionInputSchema = z.object({
  comment: z.string().min(1, 'Return comment is required'),
  version: z.number().int().positive().optional(),
});
export type ReturnTechAdoptionInput = z.infer<typeof ReturnTechAdoptionInputSchema>;

export const CreateTechAdoptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  schemeId: z.string().uuid(),
  farmerId: z.string().uuid().optional(),
  technologyId: z.string().uuid(),
  gender: TechAdoptionGenderSchema,
  adoptedOn: z.string().date().optional(),
});

export type CreateTechAdoptionInput = z.infer<typeof CreateTechAdoptionInputSchema>;

export const UpdateTechAdoptionInputSchema = z.object({
  schemeId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  technologyId: z.string().uuid().optional(),
  gender: TechAdoptionGenderSchema.optional(),
  adoptedOn: z.string().date().optional(),
  version: z.number().int().positive(),
});

export type UpdateTechAdoptionInput = z.infer<typeof UpdateTechAdoptionInputSchema>;

export const ListTechAdoptionsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  technologyId: z.string().uuid().optional(),
  gender: TechAdoptionGenderSchema.optional(),
});

export type ListTechAdoptionsQuery = z.infer<typeof ListTechAdoptionsQuerySchema>;
