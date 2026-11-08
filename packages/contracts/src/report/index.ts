import { z } from 'zod';

export const REPORT_TYPES = ['scheme_report', 'indicator_matrix', 'dam_safety_summary'] as const;
export const ReportTypeEnum = z.enum(REPORT_TYPES);
export type ReportType = z.infer<typeof ReportTypeEnum>;

export const REPORT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export const ReportStatusEnum = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatusEnum>;

export const SchemeReportParamsSchema = z.object({
  schemeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100).optional(),
  seasonId: z.string().uuid().optional(),
});
export type SchemeReportParams = z.infer<typeof SchemeReportParamsSchema>;

export const IndicatorMatrixReportParamsSchema = z.object({
  scopeType: z.enum(['scheme', 'state', 'national', 'programme']),
  scopeId: z.string().uuid().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  quarter: z.number().int().min(1).max(4).optional(),
});
export type IndicatorMatrixReportParams = z.infer<typeof IndicatorMatrixReportParamsSchema>;

export const DamSafetySummaryReportParamsSchema = z.object({
  stateId: z.string().uuid().optional(),
  basinId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
});
export type DamSafetySummaryReportParams = z.infer<typeof DamSafetySummaryReportParamsSchema>;

export const CreateReportInputSchema = z.object({
  type: ReportTypeEnum,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;

export const CreateReportResponseSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  status: ReportStatusEnum,
});
export type CreateReportResponse = z.infer<typeof CreateReportResponseSchema>;

export const ReportResponseSchema = z.object({
  id: z.string().uuid(),
  type: ReportTypeEnum,
  params: z.record(z.string(), z.unknown()).default({}),
  status: ReportStatusEnum,
  downloadUrl: z.string().url().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
});
export type ReportResponse = z.infer<typeof ReportResponseSchema>;

export const ListReportsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: ReportStatusEnum.optional(),
  type: ReportTypeEnum.optional(),
});
export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

export const ListReportsResponseSchema = z.object({
  items: z.array(ReportResponseSchema),
  nextCursor: z.string().uuid().nullable().optional(),
  total: z.number().int().optional(),
  page: z.number().int().optional(),
  limit: z.number().int().optional(),
});
export type ListReportsResponse = z.infer<typeof ListReportsResponseSchema>;

export function validateReportParams(
  type: 'scheme_report',
  params: Record<string, unknown>,
): SchemeReportParams;
export function validateReportParams(
  type: 'indicator_matrix',
  params: Record<string, unknown>,
): IndicatorMatrixReportParams;
export function validateReportParams(
  type: 'dam_safety_summary',
  params: Record<string, unknown>,
): DamSafetySummaryReportParams;
export function validateReportParams(
  type: ReportType,
  params: Record<string, unknown>,
): SchemeReportParams | IndicatorMatrixReportParams | DamSafetySummaryReportParams;
export function validateReportParams(type: ReportType, params: Record<string, unknown>) {
  switch (type) {
    case 'scheme_report':
      return SchemeReportParamsSchema.parse(params);
    case 'indicator_matrix':
      return IndicatorMatrixReportParamsSchema.parse(params);
    case 'dam_safety_summary':
      return DamSafetySummaryReportParamsSchema.parse(params);
    default:
      throw new Error(`Unsupported report type: ${type}`);
  }
}
