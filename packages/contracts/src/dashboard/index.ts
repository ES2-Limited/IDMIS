import { z } from 'zod';

export const DashboardQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  scheme: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
  sector: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  season: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
});
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export const DashboardFarmersSchema = z.object({
  total: z.number().int(),
  byGender: z.record(z.string(), z.number().int()),
});
export type DashboardFarmers = z.infer<typeof DashboardFarmersSchema>;

export const DashboardAreaSchema = z.object({
  totalHa: z.string(),
  byServiceType: z.record(z.string(), z.string()),
});
export type DashboardArea = z.infer<typeof DashboardAreaSchema>;

export const DashboardFeeRecoverySchema = z.object({
  billed: z.string(),
  collected: z.string(),
  rate: z.string().nullable(),
});
export type DashboardFeeRecovery = z.infer<typeof DashboardFeeRecoverySchema>;

export const DashboardIndicatorProgressItemSchema = z.object({
  indicatorId: z.string().uuid(),
  indicatorCode: z.string(),
  indicatorName: z.string(),
  value: z.string().nullable(),
  endTarget: z.string().nullable(),
  pctOfEndTarget: z.string().nullable(),
  status: z.string(),
});
export type DashboardIndicatorProgressItem = z.infer<typeof DashboardIndicatorProgressItemSchema>;

export const DashboardDamStatusSchema = z.object({
  meetingStandard: z.number().int(),
  notMeetingStandard: z.number().int(),
  overdue: z.number().int(),
  total: z.number().int(),
});
export type DashboardDamStatus = z.infer<typeof DashboardDamStatusSchema>;

export const DashboardLastRefreshedAtSchema = z.object({
  slis: z.string().nullable(),
  me: z.string().nullable(),
  blis: z.string().nullable(),
});
export type DashboardLastRefreshedAt = z.infer<typeof DashboardLastRefreshedAtSchema>;

export const DashboardChildSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional().nullable(),
  type: z.enum(['state', 'scheme', 'sector']),
  farmers: DashboardFarmersSchema,
  area: DashboardAreaSchema,
  feeRecovery: DashboardFeeRecoverySchema,
  indicatorProgress: z.array(DashboardIndicatorProgressItemSchema),
  damStatus: DashboardDamStatusSchema,
});
export type DashboardChildSummary = z.infer<typeof DashboardChildSummarySchema>;

export const DashboardResponseSchema = z.object({
  level: z.enum(['programme', 'state', 'scheme']),
  scopeId: z.string().nullable(),
  scopeName: z.string().nullable(),
  year: z.number().int(),
  quarter: z.number().int(),
  farmers: DashboardFarmersSchema,
  area: DashboardAreaSchema,
  feeRecovery: DashboardFeeRecoverySchema,
  indicatorProgress: z.array(DashboardIndicatorProgressItemSchema),
  damStatus: DashboardDamStatusSchema,
  lastRefreshedAt: DashboardLastRefreshedAtSchema,
  children: z.array(DashboardChildSummarySchema),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
