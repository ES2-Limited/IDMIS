import { z } from 'zod';
import { BaseListQuerySchema } from './common';
import { ModuleKeySchema } from './enums';

// --- Lookup Type ---
export const CreateLookupTypeInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  key: z.string().min(1).max(50),
  name: z.string().min(1),
  module: ModuleKeySchema,
  isSystem: z.boolean().default(false),
});
export type CreateLookupTypeInput = z.infer<typeof CreateLookupTypeInputSchema>;

export const UpdateLookupTypeInputSchema = z.object({
  name: z.string().min(1).optional(),
});
export type UpdateLookupTypeInput = z.infer<typeof UpdateLookupTypeInputSchema>;

export const LookupTypeResponseSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  module: ModuleKeySchema,
  isSystem: z.boolean(),
});
export type LookupTypeResponse = z.infer<typeof LookupTypeResponseSchema>;

export const ListLookupTypesQuerySchema = BaseListQuerySchema.extend({
  module: ModuleKeySchema.optional(),
});
export type ListLookupTypesQuery = z.infer<typeof ListLookupTypesQuerySchema>;

// --- Lookup Value ---
export const CreateLookupValueInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  lookupTypeId: z.uuid(),
  code: z.string().min(1).max(50),
  label: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateLookupValueInput = z.infer<typeof CreateLookupValueInputSchema>;

export const UpdateLookupValueInputSchema = z.object({
  label: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLookupValueInput = z.infer<typeof UpdateLookupValueInputSchema>;

export const LookupValueResponseSchema = z.object({
  id: z.uuid(),
  lookupTypeId: z.uuid(),
  code: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type LookupValueResponse = z.infer<typeof LookupValueResponseSchema>;

export const ListLookupValuesQuerySchema = BaseListQuerySchema.extend({
  lookupTypeId: z.uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});
export type ListLookupValuesQuery = z.infer<typeof ListLookupValuesQuerySchema>;
