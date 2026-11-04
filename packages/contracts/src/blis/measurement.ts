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

export const StationReadingsIntervalEnum = z.enum(['raw', 'day', 'month', 'year']);
export type StationReadingsInterval = z.infer<typeof StationReadingsIntervalEnum>;

export const GetStationReadingsQuerySchema = z.object({
  parameter: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  interval: StationReadingsIntervalEnum.default('raw'),
  quality: MeasurementQualityEnum.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursor: z.string().optional(),
});
export type GetStationReadingsQuery = z.infer<typeof GetStationReadingsQuerySchema>;

export const RawReadingItemSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  parameterId: z.string().uuid(),
  parameterCode: z.string(),
  observedAt: z.string(),
  value: z.string(),
  unit: z.string(),
  quality: z.string(),
  source: z.string(),
});
export type RawReadingItem = z.infer<typeof RawReadingItemSchema>;

export const RawReadingsResponseSchema = z.object({
  items: z.array(RawReadingItemSchema),
  nextCursor: z.string().nullable(),
});
export type RawReadingsResponse = z.infer<typeof RawReadingsResponseSchema>;

export const AggregatedReadingBucketSchema = z.object({
  bucket: z.string(),
  min: z.string(),
  max: z.string(),
  avg: z.string(),
  count: z.number().int().nonnegative(),
});
export type AggregatedReadingBucket = z.infer<typeof AggregatedReadingBucketSchema>;

export const AggregatedReadingsResponseSchema = z.object({
  interval: StationReadingsIntervalEnum,
  parameterCode: z.string(),
  unit: z.string(),
  items: z.array(AggregatedReadingBucketSchema),
});
export type AggregatedReadingsResponse = z.infer<typeof AggregatedReadingsResponseSchema>;

/**
 * Standard hydrological and meteorological unit conversions
 */
export const UNIT_CONVERSIONS: Record<string, Record<string, (val: number) => number>> = {
  // Target: meters (m)
  m: {
    m: (v) => v,
    cm: (v) => v / 100,
    mm: (v) => v / 1000,
    ft: (v) => v * 0.3048,
  },
  // Target: millimeters (mm)
  mm: {
    mm: (v) => v,
    cm: (v) => v * 10,
    m: (v) => v * 1000,
    in: (v) => v * 25.4,
  },
  // Target: cubic meters per second (m3/s)
  'm3/s': {
    'm3/s': (v) => v,
    cumec: (v) => v,
    'l/s': (v) => v / 1000,
    'm3/h': (v) => v / 3600,
    'm3/day': (v) => v / 86400,
    cfs: (v) => v * 0.028316846592,
  },
  // Target: million cubic meters (mcm)
  mcm: {
    mcm: (v) => v,
    m3: (v) => v / 1_000_000,
  },
  // Target: cubic meters (m3)
  m3: {
    m3: (v) => v,
    mcm: (v) => v * 1_000_000,
    l: (v) => v / 1000,
  },
  // Target: Celsius (C or degC)
  c: {
    c: (v) => v,
    degc: (v) => v,
    f: (v) => ((v - 32) * 5) / 9,
    degf: (v) => ((v - 32) * 5) / 9,
  },
  degc: {
    c: (v) => v,
    degc: (v) => v,
    f: (v) => ((v - 32) * 5) / 9,
    degf: (v) => ((v - 32) * 5) / 9,
  },
};

/**
 * Convert value from fromUnit to toUnit if possible.
 * Returns converted value and canonical target unit, or null if unsupported.
 */
export function convertUnit(
  valueStr: string,
  fromUnit: string,
  toUnit: string,
): { value: string; unit: string } | null {
  const normFrom = fromUnit.trim().toLowerCase();
  const normTo = toUnit.trim().toLowerCase();

  if (normFrom === normTo) {
    return { value: valueStr, unit: toUnit };
  }

  const conversionsForTarget = UNIT_CONVERSIONS[normTo];
  if (!conversionsForTarget) {
    return null;
  }

  const converter = conversionsForTarget[normFrom];
  if (!converter) {
    return null;
  }

  const num = parseFloat(valueStr);
  if (isNaN(num)) {
    return null;
  }

  const converted = converter(num);
  // Round to 4 decimal places for numeric(16, 4)
  const roundedStr = (Math.round(converted * 10000) / 10000).toFixed(4);
  return { value: roundedStr, unit: toUnit };
}
