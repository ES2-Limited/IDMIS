import { z } from 'zod';

// 1. Scorecard
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
  schemeId: z.string().uuid(),
  periodYear: z.number().int(),
  publishedOn: z.string().date().optional(),
  fileId: z.string().uuid().optional(),
});

export type CreateScorecardInput = z.infer<typeof CreateScorecardInputSchema>;

// 2. Matching Grant
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

// 3. Tech Adoption
export const TechAdoptionGenderSchema = z.enum(['female', 'male']);
export type TechAdoptionGender = z.infer<typeof TechAdoptionGenderSchema>;

export const TechAdoptionSchema = z.object({
  id: z.string().uuid(),
  schemeId: z.string().uuid(),
  farmerId: z.string().uuid().nullable().optional(),
  technologyId: z.string().uuid(),
  gender: TechAdoptionGenderSchema.nullable().optional(),
  adoptedOn: z.string().date().nullable().optional(),
  status: z.string().default('draft'),
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

export const CreateTechAdoptionInputSchema = z.object({
  schemeId: z.string().uuid(),
  farmerId: z.string().uuid().optional(),
  technologyId: z.string().uuid(),
  gender: TechAdoptionGenderSchema.optional(),
  adoptedOn: z.string().date().optional(),
});

export type CreateTechAdoptionInput = z.infer<typeof CreateTechAdoptionInputSchema>;
