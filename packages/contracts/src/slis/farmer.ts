import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { GeoJsonPointSchema, SlisReviewableColumnsSchema } from './common';
import { SlisGenderSchema } from './enums';
import { FarmerIdentityResponseSchema } from './farmer-identity';

export const InlineFarmerIdentityInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  documentTypeId: z.string().uuid(),
  number: z.string().min(1).max(50),
  bankName: z.string().max(100).optional(),
  documentFileId: z.string().uuid().optional(),
});
export type InlineFarmerIdentityInput = z.infer<typeof InlineFarmerIdentityInputSchema>;

export const CreateFarmerInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  sectorId: z.string().uuid().optional(),
  farmerCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  otherNames: z.string().max(100).optional(),
  gender: SlisGenderSchema,
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  phone: z.string().max(30).optional(),
  village: z.string().max(100).optional(),
  wardId: z.string().uuid().optional(),
  householdId: z.string().uuid().optional(),
  unitWuaId: z.string().uuid().optional(),
  farmerGroupId: z.string().uuid().optional(),
  maritalStatusId: z.string().uuid().optional(),
  nextOfKinName: z.string().max(100).optional(),
  nextOfKinPhone: z.string().max(30).optional(),
  nextOfKinRelation: z.string().max(50).optional(),
  photoFileId: z.string().uuid().optional(),
  location: GeoJsonPointSchema.optional(),
  identities: z.array(InlineFarmerIdentityInputSchema).optional(),
});
export type CreateFarmerInput = z.infer<typeof CreateFarmerInputSchema>;

export const UpdateFarmerInputSchema = CreateFarmerInputSchema.omit({
  id: true,
  schemeId: true,
  identities: true,
}).partial();
export type UpdateFarmerInput = z.infer<typeof UpdateFarmerInputSchema>;

export const FarmerResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  sectorId: z.string().uuid().nullable(),
  farmerCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  gender: SlisGenderSchema,
  birthYear: z.number().int().nullable(),
  phone: z.string().nullable(),
  village: z.string().nullable(),
  wardId: z.string().uuid().nullable(),
  stateId: z.string().uuid().nullable(),
  householdId: z.string().uuid().nullable(),
  unitWuaId: z.string().uuid().nullable(),
  farmerGroupId: z.string().uuid().nullable(),
  maritalStatusId: z.string().uuid().nullable(),
  nextOfKinName: z.string().nullable(),
  nextOfKinPhone: z.string().nullable(),
  nextOfKinRelation: z.string().nullable(),
  photoFileId: z.string().uuid().nullable(),
  location: GeoJsonPointSchema.nullable().optional(),
  identities: z.array(FarmerIdentityResponseSchema).optional(),
});
export type FarmerResponse = z.infer<typeof FarmerResponseSchema>;

export const ListFarmersQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
  gender: SlisGenderSchema.optional(),
  unitWuaId: z.string().uuid().optional(),
  farmerGroupId: z.string().uuid().optional(),
});
export type ListFarmersQuery = z.infer<typeof ListFarmersQuerySchema>;

/**
 * Privacy-preserving duplicate detection check.
 * Strictly guarantees that out-of-scope matches return COUNT ONLY, never personal data.
 */
export const CheckFarmerDuplicatesInputSchema = z.object({
  schemeId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  wardId: z.string().uuid().optional(),
  documentTypeId: z.string().uuid().optional(),
  identityNumber: z.string().optional(),
});
export type CheckFarmerDuplicatesInput = z.infer<typeof CheckFarmerDuplicatesInputSchema>;

export const InScopeDuplicateMatchSchema = z.object({
  id: z.string().uuid(),
  farmerCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  village: z.string().nullable().optional(),
  wardId: z.string().uuid().nullable().optional(),
  schemeId: z.string().uuid(),
});
export type InScopeDuplicateMatch = z.infer<typeof InScopeDuplicateMatchSchema>;

export const CheckFarmerDuplicatesResponseSchema = z.object({
  hasDuplicate: z.boolean(),
  inScopeMatches: z.array(InScopeDuplicateMatchSchema),
  outOfScopeMatchesCount: z.number().int().nonnegative(),
});
export type CheckFarmerDuplicatesResponse = z.infer<typeof CheckFarmerDuplicatesResponseSchema>;
