import { z } from 'zod';

export const MapLayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  layerTypeId: z.string().uuid(),
  basinId: z.string().uuid().nullable().optional(),
  sourceFileId: z.string().uuid().nullable().optional(),
  details: z.string().nullable().optional(),
  areaKm2: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
});
export type MapLayer = z.infer<typeof MapLayerSchema>;

export const CreateMapLayerInputSchema = z.object({
  name: z.string().min(1).max(255),
  layerTypeId: z.string().uuid(),
  basinId: z.string().uuid().optional(),
  sourceFileId: z.string().uuid().optional(),
  details: z.string().optional(),
  areaKm2: z.string().optional(),
});
export type CreateMapLayerInput = z.infer<typeof CreateMapLayerInputSchema>;

export const MapFeatureSchema = z.object({
  id: z.string().uuid(),
  layerId: z.string().uuid(),
  properties: z.record(z.string(), z.unknown()),
  geom: z.record(z.string(), z.unknown()),
});
export type MapFeature = z.infer<typeof MapFeatureSchema>;
