import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { HectaresSchema, MoneySchema, TonnageSchema } from './common';
import { ServiceTypeSchema, SlisGenderSchema } from './enums';

// 1. Farmers by Scope Report
export const FarmersByScopeItemSchema = z.object({
  schemeId: z.string().uuid(),
  schemeName: z.string().optional(),
  sectorId: z.string().uuid().nullable(),
  sectorName: z.string().nullable().optional(),
  stateId: z.string().uuid(),
  stateName: z.string().optional(),
  gender: SlisGenderSchema,
  farmerCount: z.number().int().nonnegative(),
});
export type FarmersByScopeItem = z.infer<typeof FarmersByScopeItemSchema>;

export const FarmersByScopeQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  gender: SlisGenderSchema.optional(),
});
export type FarmersByScopeQuery = z.infer<typeof FarmersByScopeQuerySchema>;

export const FarmersByScopeResponseSchema = z.object({
  items: z.array(FarmersByScopeItemSchema),
  totalFarmers: z.number().int().nonnegative(),
  lastRefreshedAt: z.string().nullable().optional(),
});
export type FarmersByScopeResponse = z.infer<typeof FarmersByScopeResponseSchema>;

// 2. Area by Service Type Report
export const AreaByServiceItemSchema = z.object({
  schemeId: z.string().uuid(),
  schemeName: z.string().optional(),
  stateId: z.string().uuid(),
  stateName: z.string().optional(),
  serviceType: ServiceTypeSchema,
  totalAreaHa: HectaresSchema,
  plotCount: z.number().int().nonnegative(),
});
export type AreaByServiceItem = z.infer<typeof AreaByServiceItemSchema>;

export const AreaByServiceQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  serviceType: ServiceTypeSchema.optional(),
});
export type AreaByServiceQuery = z.infer<typeof AreaByServiceQuerySchema>;

export const AreaByServiceResponseSchema = z.object({
  items: z.array(AreaByServiceItemSchema),
  totalAreaHa: HectaresSchema,
  totalPlots: z.number().int().nonnegative(),
  lastRefreshedAt: z.string().nullable().optional(),
});
export type AreaByServiceResponse = z.infer<typeof AreaByServiceResponseSchema>;

// 3. Cropping Report
export const CroppingItemSchema = z.object({
  schemeId: z.string().uuid(),
  schemeName: z.string().optional(),
  seasonId: z.string().uuid(),
  seasonName: z.string().optional(),
  cropTypeId: z.string().uuid(),
  cropTypeName: z.string().optional(),
  totalAreaHa: HectaresSchema,
  totalYieldT: TonnageSchema.nullable(),
  avgYieldTHa: z.string().nullable(),
});
export type CroppingItem = z.infer<typeof CroppingItemSchema>;

export const CroppingQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  cropTypeId: z.string().uuid().optional(),
});
export type CroppingQuery = z.infer<typeof CroppingQuerySchema>;

export const CroppingResponseSchema = z.object({
  items: z.array(CroppingItemSchema),
  totalCroppedAreaHa: HectaresSchema,
  lastRefreshedAt: z.string().nullable().optional(),
});
export type CroppingResponse = z.infer<typeof CroppingResponseSchema>;

// 4. Fee Recovery Report
export const FeeRecoveryItemSchema = z.object({
  schemeId: z.string().uuid(),
  schemeName: z.string().optional(),
  stateId: z.string().uuid().optional(),
  wuaId: z.string().uuid().nullable(),
  wuaName: z.string().nullable().optional(),
  seasonId: z.string().uuid(),
  seasonName: z.string().optional(),
  billedNgn: MoneySchema,
  collectedNgn: MoneySchema,
  recoveryRatePct: z.string().nullable(), // e.g. "87.50" or null when billed is 0
});
export type FeeRecoveryItem = z.infer<typeof FeeRecoveryItemSchema>;

export const FeeRecoveryQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
});
export type FeeRecoveryQuery = z.infer<typeof FeeRecoveryQuerySchema>;

export const FeeRecoveryResponseSchema = z.object({
  items: z.array(FeeRecoveryItemSchema),
  totalBilledNgn: MoneySchema,
  totalCollectedNgn: MoneySchema,
  overallRecoveryRatePct: z.string().nullable(),
  lastRefreshedAt: z.string().nullable().optional(),
});
export type FeeRecoveryResponse = z.infer<typeof FeeRecoveryResponseSchema>;

// 5. WUA Summaries Report
export const WuaSummaryItemSchema = z.object({
  wuaId: z.string().uuid(),
  wuaName: z.string(),
  regNo: z.string().nullable(),
  level: z.string(),
  schemeId: z.string().uuid(),
  schemeName: z.string().optional(),
  stateId: z.string().uuid().nullable(),
  stateName: z.string().optional(),
  isOperational: z.boolean(),
  hasMaintenanceFund: z.boolean(),
  farmerCount: z.number().int().nonnegative(),
  officerCount: z.number().int().nonnegative(),
});
export type WuaSummaryItem = z.infer<typeof WuaSummaryItemSchema>;

export const WuaSummaryQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  level: z.enum(['apex', 'sector', 'unit']).optional(),
  isOperational: z.boolean().optional(),
});
export type WuaSummaryQuery = z.infer<typeof WuaSummaryQuerySchema>;

export const WuaSummaryResponseSchema = z.object({
  items: z.array(WuaSummaryItemSchema),
  totalWuas: z.number().int().nonnegative(),
  lastRefreshedAt: z.string().nullable().optional(),
});
export type WuaSummaryResponse = z.infer<typeof WuaSummaryResponseSchema>;

// 6. Asynchronous Export Job Shapes
export const SLIS_EXPORT_DATASETS = [
  'farmers',
  'plots',
  'water_requests',
  'crops',
  'trainings',
  'fees',
  'farmers_by_scope',
  'wua_summaries',
  'area_by_service',
  'cropping',
  'fee_recovery',
] as const;
export type SlisExportDataset = (typeof SLIS_EXPORT_DATASETS)[number];
export const SlisExportDatasetSchema = z.enum(SLIS_EXPORT_DATASETS);

export const CreateExportInputSchema = z.object({
  dataset: SlisExportDatasetSchema,
  filters: z.record(z.string(), z.unknown()).optional(),
});
export type CreateExportInput = z.infer<typeof CreateExportInputSchema>;

export const CreateExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  message: z.string().optional(),
});
export type CreateExportResponse = z.infer<typeof CreateExportResponseSchema>;

export const ExportStatusResponseSchema = z.object({
  exportId: z.string().uuid(),
  dataset: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  rowCount: z.number().int().nullable().optional(),
  downloadUrl: z.string().url().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
});
export type ExportStatusResponse = z.infer<typeof ExportStatusResponseSchema>;

// Backward compatibility aliases
export const ExportSlisReportInputSchema = z.object({
  reportType: z.enum([
    'farmers',
    'plots',
    'fee_collections',
    'water_requests',
    'crop_productions',
    'fee_recovery',
  ]),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  filters: z.record(z.string(), z.unknown()).optional(),
});
export type ExportSlisReportInput = z.infer<typeof ExportSlisReportInputSchema>;

export const ExportJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  downloadUrl: z.string().url().optional(),
  expiresAt: z.iso.datetime().optional(),
});
export type ExportJobResponse = z.infer<typeof ExportJobResponseSchema>;
