import { z } from 'zod';
import { StandardResponseColumnsSchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';

/**
 * Money representation: arbitrary-precision decimal string with up to 2 decimal places.
 * NEVER represented or parsed as JavaScript floating-point number.
 */
export const MoneySchema = z
  .string()
  .regex(
    /^\d+(\.\d{1,2})?$/,
    'Must be a valid decimal money amount string (e.g. "100" or "100.50")',
  );
export type Money = z.infer<typeof MoneySchema>;

/**
 * Hectare area representation (up to 4 decimal places).
 */
export const HectaresSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid decimal area in hectares (e.g. "2.5000")');
export type Hectares = z.infer<typeof HectaresSchema>;

/**
 * Tonnage yield representation (up to 3 decimal places).
 */
export const TonnageSchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid decimal tonnage string (e.g. "15.250")');
export type Tonnage = z.infer<typeof TonnageSchema>;

/**
 * Volume representation (m3, up to 2 decimal places).
 */
export const VolumeM3Schema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal volume in m3 (e.g. "500.00")');
export type VolumeM3 = z.infer<typeof VolumeM3Schema>;

/**
 * Stream flow rate / reading value (up to 4 decimal places).
 */
export const FlowRateSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid decimal flow rate reading (e.g. "12.3456")');
export type FlowRate = z.infer<typeof FlowRateSchema>;

/**
 * GeoJSON Point geometry in SRID 4326: [longitude, latitude].
 */
export const GeoJsonPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180), // Longitude
    z.number().min(-90).max(90), // Latitude
  ]),
});
export type GeoJsonPoint = z.infer<typeof GeoJsonPointSchema>;

/**
 * GeoJSON Polygon geometry in SRID 4326.
 */
export const GeoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});
export type GeoJsonPolygon = z.infer<typeof GeoJsonPolygonSchema>;

/**
 * GeoJSON MultiPolygon geometry in SRID 4326.
 */
export const GeoJsonMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});
export type GeoJsonMultiPolygon = z.infer<typeof GeoJsonMultiPolygonSchema>;

/**
 * Generic GeoJSON Geometry acceptable for Plot / Farm boundaries.
 */
export const GeoJsonGeometrySchema = z.discriminatedUnion('type', [
  GeoJsonPointSchema,
  GeoJsonPolygonSchema,
  GeoJsonMultiPolygonSchema,
]);
export type GeoJsonGeometry = z.infer<typeof GeoJsonGeometrySchema>;

/**
 * Standard audit and lifecycle columns for SLIS reviewable entities.
 */
export const SlisReviewableColumnsSchema = StandardResponseColumnsSchema.extend({
  status: RecordStatusSchema.default('draft'),
  submittedBy: z.string().uuid().nullable().optional(),
  submittedAt: z.iso.datetime().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.iso.datetime().nullable().optional(),
  returnedBy: z.string().uuid().nullable().optional(),
  returnedAt: z.iso.datetime().nullable().optional(),
  returnComment: z.string().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type SlisReviewableColumns = z.infer<typeof SlisReviewableColumnsSchema>;
