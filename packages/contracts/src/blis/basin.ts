import { z } from 'zod';
import { GeometryInputSchema, PaginationQuerySchema } from './common';

export const BasinSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  altName: z.string().max(255).nullable().optional(),
  hydrologicalUnit: z.string().max(100).nullable().optional(),
  mainRiver: z.string().max(255).nullable().optional(),
  rbdaId: z.string().uuid().nullable().optional(),
  geom: z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .nullable()
    .optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type Basin = z.infer<typeof BasinSchema>;

export const CreateBasinInputSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  altName: z.string().max(255).optional(),
  hydrologicalUnit: z.string().max(100).optional(),
  mainRiver: z.string().max(255).optional(),
  rbdaId: z.string().uuid().nullable().optional(),
  geom: GeometryInputSchema.optional(),
});
export type CreateBasinInput = z.infer<typeof CreateBasinInputSchema>;

export const UpdateBasinInputSchema = CreateBasinInputSchema.partial().extend({
  version: z.number().int().positive(),
});
export type UpdateBasinInput = z.infer<typeof UpdateBasinInputSchema>;

export const ListBasinsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  rbdaId: z.string().uuid().optional(),
});
export type ListBasinsQuery = z.infer<typeof ListBasinsQuerySchema>;

export const BasinMorphometrySchema = z.object({
  id: z.string().uuid(),
  basinId: z.string().uuid(),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lowestPointM: z.string().nullable().optional(),
  highestPointM: z.string().nullable().optional(),
  avgSlopePct: z.string().nullable().optional(),
  streamCount: z.number().int().nullable().optional(),
  streamLengthTotalKm: z.string().nullable().optional(),
  streamLengthAvgKm: z.string().nullable().optional(),
  drainageDensity: z.string().nullable().optional(),
  streamOrder: z.number().int().nullable().optional(),
  reliefM: z.string().nullable().optional(),
  lengthKm: z.string().nullable().optional(),
  perimeterKm: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
  updatedAt: z.string(),
  updatedBy: z.string().uuid(),
  version: z.number().int().positive(),
});
export type BasinMorphometry = z.infer<typeof BasinMorphometrySchema>;

export const CreateBasinMorphometryInputSchema = z.object({
  basinId: z.string().uuid(),
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lowestPointM: z.string().optional(),
  highestPointM: z.string().optional(),
  avgSlopePct: z.string().optional(),
  streamCount: z.number().int().optional(),
  streamLengthTotalKm: z.string().optional(),
  streamLengthAvgKm: z.string().optional(),
  drainageDensity: z.string().optional(),
  streamOrder: z.number().int().optional(),
  reliefM: z.string().optional(),
  lengthKm: z.string().optional(),
  perimeterKm: z.string().optional(),
});
export type CreateBasinMorphometryInput = z.infer<typeof CreateBasinMorphometryInputSchema>;

export const UpdateBasinMorphometryInputSchema = CreateBasinMorphometryInputSchema.partial().extend(
  {
    version: z.number().int().positive(),
  },
);
export type UpdateBasinMorphometryInput = z.infer<typeof UpdateBasinMorphometryInputSchema>;

export const ListBasinMorphometryQuerySchema = PaginationQuerySchema.extend({
  basinId: z.string().uuid().optional(),
});
export type ListBasinMorphometryQuery = z.infer<typeof ListBasinMorphometryQuerySchema>;
