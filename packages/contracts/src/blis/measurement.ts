import { z } from 'zod';
import { MeasurementQualityEnum, MeasurementSourceEnum } from './enums';

export const MeasurementSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  parameterId: z.string().uuid(),
  observedAt: z.string(),
  value: z.string(), // numeric string
  unit: z.string(),
  quality: MeasurementQualityEnum.default('raw'),
  source: MeasurementSourceEnum,
  importBatchId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid(),
});
export type Measurement = z.infer<typeof MeasurementSchema>;

export const CreateMeasurementInputSchema = z.object({
  id: z.string().uuid().optional(),
  stationId: z.string().uuid(),
  parameterId: z.string().uuid(),
  observedAt: z.string(),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal string'),
  unit: z.string(),
  quality: MeasurementQualityEnum.default('raw'),
  source: MeasurementSourceEnum.default('manual'),
});
export type CreateMeasurementInput = z.infer<typeof CreateMeasurementInputSchema>;
