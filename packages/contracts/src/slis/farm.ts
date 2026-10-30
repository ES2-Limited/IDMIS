import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from '../core/common';
import { GeoJsonMultiPolygonSchema } from './common';

export const CreateFarmInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  sectorId: z.string().uuid(),
  name: z.string().max(100).optional(),
  geom: GeoJsonMultiPolygonSchema.optional(),
});
export type CreateFarmInput = z.infer<typeof CreateFarmInputSchema>;

export const UpdateFarmInputSchema = CreateFarmInputSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdateFarmInput = z.infer<typeof UpdateFarmInputSchema>;

export const FarmResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  sectorId: z.string().uuid(),
  name: z.string().nullable(),
  geom: GeoJsonMultiPolygonSchema.nullable().optional(),
});
export type FarmResponse = z.infer<typeof FarmResponseSchema>;

export const ListFarmsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
});
export type ListFarmsQuery = z.infer<typeof ListFarmsQuerySchema>;
