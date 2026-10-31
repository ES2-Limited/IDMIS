import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { HectaresSchema, SlisReviewableColumnsSchema, TonnageSchema } from './common';

export const CreateCropProductionInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  plotId: z.string().uuid(),
  seasonId: z.string().uuid(),
  cropTypeId: z.string().uuid(),
  areaHa: HectaresSchema,
  yieldT: TonnageSchema.optional(),
});
export type CreateCropProductionInput = z.infer<typeof CreateCropProductionInputSchema>;

export const UpdateCropProductionInputSchema = CreateCropProductionInputSchema.omit({
  id: true,
  schemeId: true,
  plotId: true,
  seasonId: true,
  cropTypeId: true,
}).partial();
export type UpdateCropProductionInput = z.infer<typeof UpdateCropProductionInputSchema>;

export const CropProductionResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  plotId: z.string().uuid(),
  seasonId: z.string().uuid(),
  cropTypeId: z.string().uuid(),
  areaHa: HectaresSchema,
  yieldT: TonnageSchema.nullable(),
});
export type CropProductionResponse = z.infer<typeof CropProductionResponseSchema>;

export const ListCropProductionsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  plotId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  cropTypeId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
});
export type ListCropProductionsQuery = z.infer<typeof ListCropProductionsQuerySchema>;
