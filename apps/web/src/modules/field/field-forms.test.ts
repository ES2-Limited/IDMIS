import { describe, it, expect } from 'vitest';
import {
  CreateWaterRequestInputSchema,
  CreateFeeCollectionInputSchema,
  RecordTrainingAttendanceInputSchema,
  CreateCropProductionInputSchema,
} from '@idmis/contracts';

describe('FE-2.5 Field Forms Contracts Compliance', () => {
  it('validates water request input for individual farmer level', () => {
    const valid = {
      schemeId: '018f3a70-0003-7000-8000-000000000001',
      level: 'individual' as const,
      farmerId: '018f3a70-0001-7000-8000-000000000001',
      volumeM3: '1500.00',
      periodFromOn: '2026-11-10',
      periodToOn: '2026-11-20',
    };
    expect(() => CreateWaterRequestInputSchema.parse(valid)).not.toThrow();

    // Invalid when individual level lacks farmerId
    const invalid = {
      schemeId: '018f3a70-0003-7000-8000-000000000001',
      level: 'individual' as const,
      volumeM3: '1500.00',
    };
    expect(() => CreateWaterRequestInputSchema.parse(invalid)).toThrow();
  });

  it('validates fee collection input with required paper receipt ref on device', () => {
    const valid = {
      schemeId: '018f3a70-0003-7000-8000-000000000001',
      seasonId: '018f3a70-0002-7000-8000-000000000001',
      farmerId: '018f3a70-0001-7000-8000-000000000001',
      amountNgn: '15000.00',
      paidOn: '2026-11-05',
      deviceId: '018f3a70-0004-7000-8000-000000000001',
      fieldReceiptRef: 'REC-2026-0891',
    };
    expect(() => CreateFeeCollectionInputSchema.parse(valid)).not.toThrow();

    // Invalid when deviceId provided without fieldReceiptRef
    const invalid = {
      ...valid,
      fieldReceiptRef: undefined,
    };
    expect(() => CreateFeeCollectionInputSchema.parse(invalid)).toThrow();
  });

  it('validates training attendance input for farmer attendee', () => {
    const valid = {
      trainingId: '018f3a70-0001-7000-8000-000000000001',
      farmerId: '018f3a70-0002-7000-8000-000000000001',
      gender: 'male' as const,
    };
    expect(() => RecordTrainingAttendanceInputSchema.parse(valid)).not.toThrow();

    // Staff attendance requires staffName
    const validStaff = {
      trainingId: '018f3a70-0001-7000-8000-000000000001',
      staffName: 'Aliyu Garba',
      gender: 'male' as const,
    };
    expect(() => RecordTrainingAttendanceInputSchema.parse(validStaff)).not.toThrow();
  });

  it('validates crop production seasonal yield input', () => {
    const valid = {
      schemeId: '018f3a70-0001-7000-8000-000000000001',
      plotId: '018f3a70-0002-7000-8000-000000000001',
      seasonId: '018f3a70-0003-7000-8000-000000000001',
      cropTypeId: '018f3a70-0004-7000-8000-000000000001',
      areaHa: '1.45',
      yieldT: '4.2',
    };
    expect(() => CreateCropProductionInputSchema.parse(valid)).not.toThrow();

    // Invalid when area is not matching regex
    const invalid = {
      ...valid,
      areaHa: '-1',
    };
    expect(() => CreateCropProductionInputSchema.parse(invalid)).toThrow();
  });
});
