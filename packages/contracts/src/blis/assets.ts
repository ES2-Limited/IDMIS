import { z } from 'zod';

export const BioResourceOccurrenceSchema = z.object({
  id: z.string().uuid(),
  basinId: z.string().uuid(),
  resourceId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
});
export type BioResourceOccurrence = z.infer<typeof BioResourceOccurrenceSchema>;

export const CreateBioResourceOccurrenceInputSchema = z.object({
  basinId: z.string().uuid(),
  resourceId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
});
export type CreateBioResourceOccurrenceInput = z.infer<
  typeof CreateBioResourceOccurrenceInputSchema
>;

export const WaterUsePrioritySchema = z.object({
  id: z.string().uuid(),
  basinId: z.string().uuid(),
  waterUseId: z.string().uuid(),
  priorityId: z.string().uuid(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
});
export type WaterUsePriority = z.infer<typeof WaterUsePrioritySchema>;

export const CreateWaterUsePriorityInputSchema = z.object({
  basinId: z.string().uuid(),
  waterUseId: z.string().uuid(),
  priorityId: z.string().uuid(),
});
export type CreateWaterUsePriorityInput = z.infer<typeof CreateWaterUsePriorityInputSchema>;

export const StakeholderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  abbreviation: z.string().max(50).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  contactName: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  basinIds: z.array(z.string().uuid()).optional(),
});
export type Stakeholder = z.infer<typeof StakeholderSchema>;

export const CreateStakeholderInputSchema = z.object({
  name: z.string().min(1).max(255),
  abbreviation: z.string().max(50).optional(),
  categoryId: z.string().uuid().optional(),
  contactName: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  basinIds: z.array(z.string().uuid()).optional(),
});
export type CreateStakeholderInput = z.infer<typeof CreateStakeholderInputSchema>;

export const UpdateStakeholderInputSchema = CreateStakeholderInputSchema.partial().extend({
  version: z.number().int().positive(),
});
export type UpdateStakeholderInput = z.infer<typeof UpdateStakeholderInputSchema>;
