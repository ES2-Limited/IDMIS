import { describe, expect, it } from 'vitest';
import {
  CreateReportInputSchema,
  CreateReportResponseSchema,
  ReportResponseSchema,
  SchemeReportParamsSchema,
  IndicatorMatrixReportParamsSchema,
  DamSafetySummaryReportParamsSchema,
  validateReportParams,
} from './index';

describe('Report Contracts & Schemas (BE-5.2)', () => {
  it('validates CreateReportInput for scheme report', () => {
    const input = {
      type: 'scheme_report',
      params: {
        schemeId: '018f3a5e-0000-7000-8000-000000000001',
        year: 2026,
      },
    };
    const parsed = CreateReportInputSchema.parse(input);
    expect(parsed.type).toBe('scheme_report');
    expect(parsed.params.year).toBe(2026);
  });

  it('validates CreateReportInput for indicator matrix', () => {
    const input = {
      type: 'indicator_matrix',
      params: {
        scopeType: 'programme',
        year: 2026,
        quarter: 2,
      },
    };
    const parsed = CreateReportInputSchema.parse(input);
    expect(parsed.type).toBe('indicator_matrix');
  });

  it('validates SchemeReportParamsSchema', () => {
    const valid = {
      schemeId: '018f3a5e-0000-7000-8000-000000000001',
      year: 2026,
    };
    expect(SchemeReportParamsSchema.parse(valid)).toEqual(valid);
  });

  it('validates IndicatorMatrixReportParamsSchema', () => {
    const valid = {
      scopeType: 'state',
      scopeId: '018f3a5e-0000-7000-8000-000000000002',
      year: 2026,
      quarter: 1,
    };
    expect(IndicatorMatrixReportParamsSchema.parse(valid)).toEqual(valid);
  });

  it('validates DamSafetySummaryReportParamsSchema', () => {
    const valid = {
      stateId: '018f3a5e-0000-7000-8000-000000000002',
    };
    expect(DamSafetySummaryReportParamsSchema.parse(valid)).toEqual(valid);
  });

  it('validates CreateReportResponseSchema', () => {
    const response = {
      id: '018f3a5e-0000-7000-8000-000000000099',
      reportId: '018f3a5e-0000-7000-8000-000000000099',
      status: 'queued',
    };
    expect(CreateReportResponseSchema.parse(response)).toEqual(response);
  });

  it('validates ReportResponseSchema when completed with signed link', () => {
    const response = {
      id: '018f3a5e-0000-7000-8000-000000000099',
      type: 'scheme_report',
      params: { schemeId: '018f3a5e-0000-7000-8000-000000000001' },
      status: 'completed',
      downloadUrl: 'https://storage.idmis.gov.ng/reports/rep-1.pdf?signature=abc',
      expiresAt: '2026-11-07T12:30:00.000Z',
      createdAt: '2026-11-07T12:00:00.000Z',
      completedAt: '2026-11-07T12:01:00.000Z',
    };
    expect(ReportResponseSchema.parse(response)).toEqual(response);
  });

  it('validates parameters via validateReportParams helper', () => {
    const validScheme = validateReportParams('scheme_report', {
      schemeId: '018f3a5e-0000-7000-8000-000000000001',
    });
    expect(validScheme.schemeId).toBe('018f3a5e-0000-7000-8000-000000000001');

    expect(() =>
      validateReportParams('scheme_report', {
        schemeId: 'not-a-uuid',
      }),
    ).toThrow();
  });
});
