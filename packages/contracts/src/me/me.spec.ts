import { describe, it, expect } from 'vitest';
import {
  normalizeDisaggregation,
  CreateIndicatorInputSchema,
  KNOWN_COMPUTE_KEYS,
  DisaggregationSchema,
  type KnownComputeKey,
} from '../index';

describe('M&E Contracts & Disaggregation Normalisation (BE-3.1)', () => {
  it('normalises disaggregation by sorting keys and stripping null, undefined, and empty string values', () => {
    const raw = {
      gender: 'female',
      z_extra: '',
      age_group: 'youth',
      null_field: null,
      undefined_field: undefined,
    };

    const normalised = normalizeDisaggregation(raw);

    // Keys must be sorted: age_group, then gender. Others stripped.
    expect(Object.keys(normalised)).toEqual(['age_group', 'gender']);
    expect(normalised).toEqual({
      age_group: 'youth',
      gender: 'female',
    });
  });

  it('handles empty or non-object inputs gracefully', () => {
    expect(normalizeDisaggregation(null)).toEqual({});
    expect(normalizeDisaggregation(undefined)).toEqual({});
    expect(normalizeDisaggregation('string')).toEqual({});
    expect(normalizeDisaggregation(123)).toEqual({});
    expect(normalizeDisaggregation([])).toEqual({});
  });

  it('DisaggregationSchema transform normalises inputs automatically', () => {
    const parsed = DisaggregationSchema.parse({
      scheme: 'kaduna',
      null_val: null,
      crop: 'rice',
      empty: '',
    });

    expect(Object.keys(parsed)).toEqual(['crop', 'scheme']);
    expect(parsed).toEqual({
      crop: 'rice',
      scheme: 'kaduna',
    });
  });

  it('validates indicator requires computeKey if method is computed', () => {
    const baseValid = {
      frameworkId: '018f3a5e-0004-7000-8000-000000000001',
      code: '1a',
      name: 'Beneficiary Farmers',
      level: 'pdo' as const,
      unit: 'Number',
      method: 'computed' as const,
    };

    // Missing computeKey -> invalid
    const invalidRes = CreateIndicatorInputSchema.safeParse(baseValid);
    expect(invalidRes.success).toBe(false);

    // Provided computeKey -> valid
    const validRes = CreateIndicatorInputSchema.safeParse({
      ...baseValid,
      computeKey: 'slis.beneficiaries',
    });
    expect(validRes.success).toBe(true);
  });

  it('allows manual indicator without computeKey', () => {
    const manualRes = CreateIndicatorInputSchema.safeParse({
      frameworkId: '018f3a5e-0004-7000-8000-000000000001',
      code: '5a',
      name: 'Grievances Resolved',
      level: 'intermediate',
      unit: '%',
      method: 'manual',
    });
    expect(manualRes.success).toBe(true);
  });

  it('includes known compute keys', () => {
    expect(KNOWN_COMPUTE_KEYS.has('slis.beneficiaries')).toBe(true);
    expect(KNOWN_COMPUTE_KEYS.has('slis.fee_recovery')).toBe(true);
    expect(KNOWN_COMPUTE_KEYS.has('me.tech_adoption')).toBe(true);
    expect(KNOWN_COMPUTE_KEYS.has('non_existent_key' as KnownComputeKey)).toBe(false);
  });
});
