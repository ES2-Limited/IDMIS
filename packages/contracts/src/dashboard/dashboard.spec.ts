import { describe, it, expect } from 'vitest';
import {
  DashboardQuerySchema,
  DashboardResponseSchema,
  DashboardFarmersSchema,
  DashboardAreaSchema,
  DashboardFeeRecoverySchema,
  DashboardDamStatusSchema,
  DashboardChildSummarySchema,
} from './index';

describe('Dashboard Contracts Specification', () => {
  it('parses valid dashboard query parameters with coercion', () => {
    const parsed = DashboardQuerySchema.parse({
      year: '2026',
      quarter: '2',
      scheme: '018f3a5e-1111-7000-8000-000000000001',
      season: '018f3a5e-2222-7000-8000-000000000002',
    });

    expect(parsed.year).toBe(2026);
    expect(parsed.quarter).toBe(2);
    expect(parsed.scheme).toBe('018f3a5e-1111-7000-8000-000000000001');
    expect(parsed.season).toBe('018f3a5e-2222-7000-8000-000000000002');
  });

  it('validates dashboard response schema with headline and children numbers', () => {
    const mockResponse = {
      level: 'programme' as const,
      scopeId: null,
      scopeName: 'National Programme',
      year: 2026,
      quarter: 2,
      farmers: {
        total: 1500,
        byGender: { female: 600, male: 900 },
      },
      area: {
        totalHa: '4500.5000',
        byServiceType: { gravity: '3000.0000', pump: '1500.5000' },
      },
      feeRecovery: {
        billed: '12000000.00',
        collected: '10500000.00',
        rate: '87.50',
      },
      indicatorProgress: [
        {
          indicatorId: '018f3a5e-3333-7000-8000-000000000001',
          indicatorCode: 'IND-01',
          indicatorName: 'Area provided with irrigation services',
          value: '4500.50',
          endTarget: '10000.00',
          pctOfEndTarget: '45.01',
          status: 'on_track',
        },
      ],
      damStatus: {
        meetingStandard: 4,
        notMeetingStandard: 1,
        overdue: 0,
        total: 5,
      },
      lastRefreshedAt: {
        slis: '2026-05-15T12:00:00.000Z',
        me: '2026-05-15T12:05:00.000Z',
        blis: '2026-05-15T12:10:00.000Z',
      },
      children: [
        {
          id: '018f3a5e-0001-7000-8000-000000000019',
          name: 'Kano',
          code: 'KN',
          type: 'state' as const,
          farmers: {
            total: 1000,
            byGender: { female: 400, male: 600 },
          },
          area: {
            totalHa: '3000.5000',
            byServiceType: { gravity: '2000.0000', pump: '1000.5000' },
          },
          feeRecovery: {
            billed: '8000000.00',
            collected: '7000000.00',
            rate: '87.50',
          },
          indicatorProgress: [],
          damStatus: {
            meetingStandard: 3,
            notMeetingStandard: 1,
            overdue: 0,
            total: 4,
          },
        },
      ],
    };

    const validated = DashboardResponseSchema.parse(mockResponse);
    expect(validated.level).toBe('programme');
    expect(validated.farmers.total).toBe(1500);
    expect(validated.children.length).toBe(1);
    expect(validated.children[0]?.name).toBe('Kano');
  });

  it('validates individual schemas', () => {
    expect(
      DashboardFarmersSchema.parse({ total: 10, byGender: { female: 4, male: 6 } }),
    ).toBeDefined();
    expect(
      DashboardAreaSchema.parse({ totalHa: '100.0000', byServiceType: { new: '100.0000' } }),
    ).toBeDefined();
    expect(
      DashboardFeeRecoverySchema.parse({ billed: '100.00', collected: '80.00', rate: '80.00' }),
    ).toBeDefined();
    expect(
      DashboardDamStatusSchema.parse({
        meetingStandard: 1,
        notMeetingStandard: 0,
        overdue: 0,
        total: 1,
      }),
    ).toBeDefined();
    expect(
      DashboardChildSummarySchema.parse({
        id: '018f3a5e-1111-7000-8000-000000000001',
        name: 'Kano State',
        code: 'KN',
        type: 'state',
        farmers: { total: 0, byGender: {} },
        area: { totalHa: '0.0000', byServiceType: {} },
        feeRecovery: { billed: '0.00', collected: '0.00', rate: null },
        indicatorProgress: [],
        damStatus: { meetingStandard: 0, notMeetingStandard: 0, overdue: 0, total: 0 },
      }),
    ).toBeDefined();
  });
});
