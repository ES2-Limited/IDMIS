import { describe, it, expect } from 'vitest';
import { CreateFarmerInputSchema } from '@idmis/contracts';

describe('Farmer Registration Validation (FE-2.3)', () => {
  it('validates a complete offline registration payload matching contracts exactly', () => {
    const validFarmerPayload = {
      id: '018f3a70-0001-7000-8000-000000000001',
      schemeId: '018f3a70-0002-7000-8000-000000000001',
      sectorId: '018f3a70-0003-7000-8000-000000000001',
      farmerCode: 'NG-KRIS-982143',
      firstName: 'Ibrahim',
      lastName: 'Suleiman',
      otherNames: 'Shehu',
      gender: 'male',
      birthYear: 1980,
      phone: '+2348031234567',
      village: 'Chiromawa',
      wardId: '018f3a70-0004-7000-8000-000000000001',
      unitWuaId: '018f3a70-0005-7000-8000-000000000001',
      location: {
        type: 'Point' as const,
        coordinates: [8.512345, 11.901234] as [number, number],
      },
      identities: [
        {
          id: '018f3a70-0006-7000-8000-000000000001',
          documentTypeId: '018f3a70-0007-7000-8000-000000000001',
          number: '12345678901',
        },
      ],
    };

    const parseResult = CreateFarmerInputSchema.safeParse(validFarmerPayload);
    expect(parseResult.success).toBe(true);
  });

  it('rejects invalid coordinates or missing required identity fields', () => {
    const invalidPayload = {
      schemeId: '018f3a70-0002-7000-8000-000000000001',
      farmerCode: 'NG-KRIS-000000',
      firstName: '', // Missing first name
      lastName: 'Garba',
      gender: 'unknown', // Invalid gender
      location: {
        type: 'Point',
        coordinates: [200, 100], // Out of range longitude (> 180) and latitude (> 90)
      },
    };

    const parseResult = CreateFarmerInputSchema.safeParse(invalidPayload);
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      expect(fieldErrors.firstName).toBeDefined();
      expect(fieldErrors.gender).toBeDefined();
      expect(fieldErrors.location).toBeDefined();
    }
  });
});
