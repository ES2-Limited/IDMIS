import { z } from 'zod';

export const StationLookupSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  location: z.unknown().nullable().optional(),
  basinId: z.string().uuid(),
  stationTypeId: z.string().uuid(),
  wardId: z.string().uuid().nullable().optional(),
  river: z.string().nullable().optional(),
});
export type StationLookup = z.infer<typeof StationLookupSchema>;

export const StationValidationResultSchema = z.object({
  valid: z.boolean(),
  reason: z.enum(['not_found', 'inactive']).optional(),
  station: StationLookupSchema.optional(),
});
export type StationValidationResult = z.infer<typeof StationValidationResultSchema>;

export const LatestReadingSummarySchema = z.object({
  stationId: z.string().uuid(),
  parameterId: z.string().uuid(),
  observedAt: z.iso.datetime(),
  value: z.string(),
  unit: z.string(),
  quality: z.string(),
});
export type LatestReadingSummary = z.infer<typeof LatestReadingSummarySchema>;

export const DamSafetyStatusSchema = z.object({
  damId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  inspectedOn: z.string(),
  meetsStandard: z.boolean(),
  hazardClassId: z.string().uuid().nullable().optional(),
  hazardClass: z.string().nullable().optional(),
  nextDueOn: z.string().nullable().optional(),
  isOverdue: z.boolean(),
  approvedAt: z.iso.datetime(),
});
export type DamSafetyStatus = z.infer<typeof DamSafetyStatusSchema>;

export const BasinSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  rbdaId: z.string().uuid().nullable().optional(),
  stationCount: z.number().int(),
  damCount: z.number().int(),
  reservoirCount: z.number().int(),
});
export type BasinSummary = z.infer<typeof BasinSummarySchema>;
