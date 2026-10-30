import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from '../core/common';

export const CreateFarmerGroupInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  groupTypeId: z.string().uuid().optional(),
});
export type CreateFarmerGroupInput = z.infer<typeof CreateFarmerGroupInputSchema>;

export const UpdateFarmerGroupInputSchema = CreateFarmerGroupInputSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdateFarmerGroupInput = z.infer<typeof UpdateFarmerGroupInputSchema>;

export const FarmerGroupResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  name: z.string(),
  groupTypeId: z.string().uuid().nullable(),
});
export type FarmerGroupResponse = z.infer<typeof FarmerGroupResponseSchema>;

export const ListFarmerGroupsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  groupTypeId: z.string().uuid().optional(),
});
export type ListFarmerGroupsQuery = z.infer<typeof ListFarmerGroupsQuerySchema>;
