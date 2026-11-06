import { describe, it, expect } from 'vitest';
import {
  CreateBasinInputSchema,
  CreateStationInputSchema,
  CreateParameterInputSchema,
  CreateMeasurementInputSchema,
  CreateDamInputSchema,
  CreateDamSafetyInspectionInputSchema,
  CreateStakeholderInputSchema,
  StationTypeEnum,
  ComponentRatingEnum,
  DamComponentEnum,
  MeasurementQualityEnum,
  MeasurementSourceEnum,
} from './index';

describe('BLIS Contracts (BE-4.1)', () => {
  it('validates enums correctly', () => {
    expect(StationTypeEnum.options).toContain('discharge');
    expect(StationTypeEnum.options).toContain('rainfall');
    expect(StationTypeEnum.options).toContain('water_level');
    expect(StationTypeEnum.options).toContain('water_quality');

    expect(ComponentRatingEnum.options).toEqual(['good', 'fair', 'poor', 'critical']);
    expect(DamComponentEnum.options).toContain('dam_body');
    expect(MeasurementQualityEnum.options).toEqual(['raw', 'checked', 'suspect']);
    expect(MeasurementSourceEnum.options).toEqual(['manual', 'import', 'logger']);
  });

  it('validates basin input schema', () => {
    const valid = CreateBasinInputSchema.safeParse({
      code: 'BASIN-001',
      name: 'Hadejia-Jamaare River Basin',
      altName: 'HJRB',
      hydrologicalUnit: 'HU-8',
      mainRiver: 'Hadejia',
      geom: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [8.5, 11.5],
              [8.6, 11.5],
              [8.6, 11.6],
              [8.5, 11.6],
              [8.5, 11.5],
            ],
          ],
        ],
      },
    });
    expect(valid.success).toBe(true);

    const invalid = CreateBasinInputSchema.safeParse({
      code: '',
      name: 'Missing Code',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates station and parameter schemas', () => {
    const validParam = CreateParameterInputSchema.safeParse({
      code: 'DISCHARGE',
      name: 'River Discharge',
      defaultUnit: 'm3/s',
    });
    expect(validParam.success).toBe(true);

    const validStation = CreateStationInputSchema.safeParse({
      code: 'ST-001',
      name: 'Wudil Gauge Station',
      basinId: '018f3a5e-0000-7000-8000-000000000001',
      stationTypeId: '018f3a5e-0000-7000-8000-000000000002',
      geom: { type: 'Point', coordinates: [8.8, 11.8] },
    });
    expect(validStation.success).toBe(true);
  });

  it('validates measurement input with decimal string value', () => {
    const valid = CreateMeasurementInputSchema.safeParse({
      stationId: '018f3a5e-0000-7000-8000-000000000001',
      parameterId: '018f3a5e-0000-7000-8000-000000000002',
      observedAt: '2026-06-15T12:00:00Z',
      value: '142.5000',
      unit: 'm3/s',
      quality: 'raw',
      source: 'manual',
    });
    expect(valid.success).toBe(true);

    const invalidFloat = CreateMeasurementInputSchema.safeParse({
      stationId: '018f3a5e-0000-7000-8000-000000000001',
      parameterId: '018f3a5e-0000-7000-8000-000000000002',
      observedAt: '2026-06-15T12:00:00Z',
      value: 'invalid-decimal',
      unit: 'm3/s',
    });
    expect(invalidFloat.success).toBe(false);
  });

  it('validates dam and inspection with components', () => {
    const validDam = CreateDamInputSchema.safeParse({
      code: 'DAM-TIGA',
      name: 'Tiga Dam',
      basinId: '018f3a5e-0000-7000-8000-000000000001',
    });
    expect(validDam.success).toBe(true);

    const validInspection = CreateDamSafetyInspectionInputSchema.safeParse({
      damId: '018f3a5e-0000-7000-8000-000000000001',
      inspectedOn: '2026-03-20',
      components: [
        {
          component: 'dam_body',
          ratingId: '018f3a5e-0000-7000-8000-000000000002',
        },
        {
          component: 'spillway_1',
          ratingId: '018f3a5e-0000-7000-8000-000000000003',
        },
      ],
    });
    expect(validInspection.success).toBe(true);
  });

  it('validates stakeholder schema', () => {
    const valid = CreateStakeholderInputSchema.safeParse({
      name: 'Chad Basin Stakeholder Group',
      abbreviation: 'CBSG',
      email: 'contact@cbsg.org',
    });
    expect(valid.success).toBe(true);
  });
});
