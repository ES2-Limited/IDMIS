import { z } from 'zod';

export const StationTypeEnum = z.enum([
  'discharge',
  'rainfall',
  'water_level',
  'water_quality',
  'hydrological',
  'meteorological',
  'agro_meteorological',
]);
export type StationType = z.infer<typeof StationTypeEnum>;

export const DamPurposeEnum = z.enum(['irrigation', 'flood_control', 'water_supply', 'hydropower']);
export type DamPurpose = z.infer<typeof DamPurposeEnum>;

export const DamCategoryEnum = z.enum(['large', 'medium', 'small']);
export type DamCategory = z.infer<typeof DamCategoryEnum>;

export const HazardClassEnum = z.enum(['high', 'significant', 'low']);
export type HazardClass = z.infer<typeof HazardClassEnum>;

export const ComponentRatingEnum = z.enum(['good', 'fair', 'poor', 'critical']);
export type ComponentRating = z.infer<typeof ComponentRatingEnum>;

export const DamComponentEnum = z.enum([
  'dam_body',
  'spillway_1',
  'spillway_2',
  'inlet',
  'outlet',
  'electrical',
  'mechanical',
]);
export type DamComponent = z.infer<typeof DamComponentEnum>;

export const MeasurementQualityEnum = z.enum(['raw', 'checked', 'suspect']);
export type MeasurementQuality = z.infer<typeof MeasurementQualityEnum>;

export const MeasurementSourceEnum = z.enum(['manual', 'import', 'logger']);
export type MeasurementSource = z.infer<typeof MeasurementSourceEnum>;

export const InspectionStatusEnum = z.enum(['submitted', 'approved', 'returned']);
export type InspectionStatus = z.infer<typeof InspectionStatusEnum>;
