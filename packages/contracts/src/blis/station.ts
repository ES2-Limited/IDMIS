import { z } from 'zod';
import { GeometryInputSchema, PaginationQuerySchema } from './common';

export const ParameterSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  defaultUnit: z.string().min(1).max(50),
});
export type Parameter = z.infer<typeof ParameterSchema>;

export const CreateParameterInputSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  defaultUnit: z.string().min(1).max(50),
});
export type CreateParameterInput = z.infer<typeof CreateParameterInputSchema>;

export const StationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  basinId: z.string().uuid(),
  stationTypeId: z.string().uuid(),
  wardId: z.string().uuid().nullable().optional(),
  river: z.string().max(255).nullable().optional(),
  geom: z.union([z.record(z.string(), z.unknown()), z.string()]),
  installedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type Station = z.infer<typeof StationSchema>;

export const CreateStationInputSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  basinId: z.string().uuid(),
  stationTypeId: z.string().uuid(),
  wardId: z.string().uuid().optional(),
  river: z.string().max(255).optional(),
  geom: GeometryInputSchema,
  installedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true).optional(),
});
export type CreateStationInput = z.infer<typeof CreateStationInputSchema>;

export const UpdateStationInputSchema = CreateStationInputSchema.partial().extend({
  version: z.number().int().positive(),
});
export type UpdateStationInput = z.infer<typeof UpdateStationInputSchema>;

export const ListStationsQuerySchema = PaginationQuerySchema.extend({
  basinId: z.string().uuid().optional(),
  stationTypeId: z.string().uuid().optional(),
  search: z.string().optional(),
});
export type ListStationsQuery = z.infer<typeof ListStationsQuerySchema>;
