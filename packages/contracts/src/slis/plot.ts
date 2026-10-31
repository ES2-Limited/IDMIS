import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { GeoJsonGeometrySchema, HectaresSchema, SlisReviewableColumnsSchema } from './common';
import { ServiceTypeSchema } from './enums';

export const CreatePlotInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  schemeId: z.string().uuid(),
  farmId: z.string().uuid().optional(),
  sectorId: z.string().uuid(),
  plotCode: z.string().min(1).max(50),
  irrigationTypeId: z.string().uuid().optional(),
  serviceType: ServiceTypeSchema.optional(),
  wardId: z.string().uuid().optional(),
  geom: GeoJsonGeometrySchema.optional(),
  gpsAccuracyM: z.number().positive().max(100).optional(),
});
export type CreatePlotInput = z.infer<typeof CreatePlotInputSchema>;

export const UpdatePlotInputSchema = CreatePlotInputSchema.omit({
  id: true,
  schemeId: true,
}).partial();
export type UpdatePlotInput = z.infer<typeof UpdatePlotInputSchema>;

export const PlotResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  farmId: z.string().uuid().nullable(),
  sectorId: z.string().uuid(),
  plotCode: z.string(),
  areaHa: HectaresSchema.nullable(),
  irrigationTypeId: z.string().uuid().nullable(),
  serviceType: ServiceTypeSchema.nullable(),
  wardId: z.string().uuid().nullable(),
  stateId: z.string().uuid().nullable(),
  geom: GeoJsonGeometrySchema.nullable().optional(),
  gpsAccuracyM: z.number().nullable().optional(),
});
export type PlotResponse = z.infer<typeof PlotResponseSchema>;

export const ListPlotsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  farmId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
  serviceType: ServiceTypeSchema.optional(),
});
export type ListPlotsQuery = z.infer<typeof ListPlotsQuerySchema>;
