import { z } from 'zod';
import type { ImportColumnDefinition } from '../core/import';
import { MeasurementQualityEnum } from './enums';

export const BLIS_IMPORT_DATASETS = [
  'blis.basin',
  'blis.station',
  'blis.dam',
  'blis.measurement',
] as const;
export const BlisImportDatasetSchema = z.enum(BLIS_IMPORT_DATASETS);
export type BlisImportDataset = z.infer<typeof BlisImportDatasetSchema>;

/**
 * 1. blis.basin Import Row Schema
 */
export const BasinImportRowSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  altName: z.string().max(255).optional(),
  hydrologicalUnit: z.string().max(100).optional(),
  mainRiver: z.string().max(255).optional(),
  rbdaCode: z.string().min(1).optional(),
  geomWkt: z.string().optional(),
});
export type BasinImportRow = z.infer<typeof BasinImportRowSchema>;

/**
 * 2. blis.station Import Row Schema
 */
export const StationImportRowSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  basinCode: z.string().min(1),
  stationTypeCode: z.string().min(1),
  wardCode: z.string().optional(),
  river: z.string().max(255).optional(),
  geomWkt: z.string().min(1),
  altitudeM: z.string().optional(),
  installedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type StationImportRow = z.infer<typeof StationImportRowSchema>;

/**
 * 3. blis.dam Import Row Schema
 */
export const DamImportRowSchema = z.object({
  name: z.string().min(1).max(255),
  basinCode: z.string().min(1),
  reservoirName: z.string().optional(),
  damPurposeCode: z.string().optional(),
  damCategoryCode: z.string().optional(),
  hazardClassCode: z.string().optional(),
  yearCompleted: z.coerce.number().int().min(1800).max(2100).optional(),
  crestLengthM: z.string().optional(),
  heightM: z.string().optional(),
  storageCapacityMcm: z.string().optional(),
  geomWkt: z.string().optional(),
});
export type DamImportRow = z.infer<typeof DamImportRowSchema>;

/**
 * 4. blis.measurement Import Row Schema
 */
export const MeasurementImportRowSchema = z.object({
  stationCode: z.string().min(1).max(50),
  parameterCode: z.string().min(1).max(50),
  observedAt: z.string().min(1),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal string'),
  unit: z.string().min(1),
  quality: MeasurementQualityEnum.default('raw'),
});
export type MeasurementImportRow = z.infer<typeof MeasurementImportRowSchema>;

export const BLIS_IMPORT_TEMPLATES: Record<BlisImportDataset, ImportColumnDefinition[]> = {
  'blis.basin': [
    { name: 'code', header: 'Basin Code', type: 'string', required: true, example: 'HJRB' },
    {
      name: 'name',
      header: 'Basin Name',
      type: 'string',
      required: true,
      example: 'Hadejia-Jamaare',
    },
    {
      name: 'altName',
      header: 'Alternative Name',
      type: 'string',
      required: false,
      example: 'HJ Basin',
    },
    {
      name: 'hydrologicalUnit',
      header: 'Hydrological Unit',
      type: 'string',
      required: false,
      example: 'HU-8',
    },
    {
      name: 'mainRiver',
      header: 'Main River',
      type: 'string',
      required: false,
      example: 'Hadejia',
    },
    { name: 'rbdaCode', header: 'RBDA Code', type: 'string', required: false, example: 'HJRBDA' },
    {
      name: 'geomWkt',
      header: 'Boundary Geometry (WKT)',
      type: 'string',
      required: false,
      example: 'MULTIPOLYGON(((8.5 11.5, 8.6 11.5, 8.6 11.6, 8.5 11.6, 8.5 11.5)))',
    },
  ],
  'blis.station': [
    { name: 'code', header: 'Station Code', type: 'string', required: true, example: 'ST-001' },
    {
      name: 'name',
      header: 'Station Name',
      type: 'string',
      required: true,
      example: 'Wudil Gauge',
    },
    { name: 'basinCode', header: 'Basin Code', type: 'string', required: true, example: 'HJRB' },
    {
      name: 'stationTypeCode',
      header: 'Station Type Code',
      type: 'string',
      required: true,
      example: 'discharge',
    },
    { name: 'wardCode', header: 'Ward Code', type: 'string', required: false, example: 'WARD-01' },
    { name: 'river', header: 'River', type: 'string', required: false, example: 'Hadejia' },
    {
      name: 'geomWkt',
      header: 'Location (WKT Point)',
      type: 'string',
      required: true,
      example: 'POINT(8.85 11.80)',
    },
    {
      name: 'altitudeM',
      header: 'Altitude (m)',
      type: 'string',
      required: false,
      example: '380.50',
    },
    {
      name: 'installedOn',
      header: 'Installed On (YYYY-MM-DD)',
      type: 'string',
      required: false,
      example: '2020-01-15',
    },
  ],
  'blis.dam': [
    { name: 'name', header: 'Dam Name', type: 'string', required: true, example: 'Tiga Dam' },
    { name: 'basinCode', header: 'Basin Code', type: 'string', required: true, example: 'HJRB' },
    {
      name: 'reservoirName',
      header: 'Reservoir Name',
      type: 'string',
      required: false,
      example: 'Tiga Reservoir',
    },
    {
      name: 'damPurposeCode',
      header: 'Dam Purpose Code',
      type: 'string',
      required: false,
      example: 'irrigation',
    },
    {
      name: 'damCategoryCode',
      header: 'Dam Category Code',
      type: 'string',
      required: false,
      example: 'major',
    },
    {
      name: 'hazardClassCode',
      header: 'Hazard Class Code',
      type: 'string',
      required: false,
      example: 'high',
    },
    {
      name: 'yearCompleted',
      header: 'Year Completed',
      type: 'number',
      required: false,
      example: 1974,
    },
    {
      name: 'crestLengthM',
      header: 'Crest Length (m)',
      type: 'string',
      required: false,
      example: '6000.00',
    },
    { name: 'heightM', header: 'Height (m)', type: 'string', required: false, example: '48.00' },
    {
      name: 'storageCapacityMcm',
      header: 'Storage Capacity (MCM)',
      type: 'string',
      required: false,
      example: '1874.00',
    },
    {
      name: 'geomWkt',
      header: 'Location (WKT Point)',
      type: 'string',
      required: false,
      example: 'POINT(8.60 11.45)',
    },
  ],
  'blis.measurement': [
    {
      name: 'stationCode',
      header: 'Station Code',
      type: 'string',
      required: true,
      example: 'ST-001',
    },
    {
      name: 'parameterCode',
      header: 'Parameter Code',
      type: 'string',
      required: true,
      example: 'WL',
    },
    {
      name: 'observedAt',
      header: 'Observed At (ISO)',
      type: 'string',
      required: true,
      example: '2026-03-15T12:00:00Z',
    },
    {
      name: 'value',
      header: 'Value',
      type: 'string',
      required: true,
      example: '14.2500',
    },
    {
      name: 'unit',
      header: 'Unit',
      type: 'string',
      required: true,
      example: 'm',
    },
    {
      name: 'quality',
      header: 'Quality',
      type: 'string',
      required: false,
      example: 'raw',
    },
  ],
};
