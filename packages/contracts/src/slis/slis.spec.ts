import { describe, it, expect } from 'vitest';
import {
  MoneySchema,
  HectaresSchema,
  TonnageSchema,
  VolumeM3Schema,
  FlowRateSchema,
  GeoJsonPointSchema,
  GeoJsonPolygonSchema,
  GeoJsonMultiPolygonSchema,
} from './common';
import {
  CreateFarmerInputSchema,
  CheckFarmerDuplicatesInputSchema,
  CheckFarmerDuplicatesResponseSchema,
} from './farmer';
import {
  FarmerIdentityResponseSchema,
  UnmaskedFarmerIdentityResponseSchema,
  CreateFarmerIdentityInputSchema,
} from './farmer-identity';
import { CreatePlotInputSchema, PlotResponseSchema } from './plot';
import { CreateWaterRequestInputSchema } from './water-request';
import { CreateFeeBillingInputSchema, CreateFeeCollectionInputSchema } from './fee';
import {
  ReturnRecordInputSchema,
  BulkApproveInputSchema,
  BulkApproveResponseSchema,
} from './review';
import {
  SyncCursorSchema,
  SyncPushInputSchema,
  SyncPushResponseSchema,
  SyncPullResponseSchema,
} from './sync';
import {
  FarmersByScopeResponseSchema,
  AreaByServiceResponseSchema,
  CroppingResponseSchema,
  FeeRecoveryResponseSchema,
} from './reports';
import {
  SLIS_IMPORT_TEMPLATES,
  FarmerImportRowSchema,
  FeeCollectionImportRowSchema,
} from './imports';
import { permissions, permissionKinds } from '../permissions';

describe('SLIS Contracts Specification (Phase 1)', () => {
  describe('Money & Decimal Representation', () => {
    it('accepts valid decimal money strings and rejects JS numbers or invalid formats', () => {
      expect(MoneySchema.safeParse('15000').success).toBe(true);
      expect(MoneySchema.safeParse('15000.00').success).toBe(true);
      expect(MoneySchema.safeParse('0.50').success).toBe(true);
      expect(MoneySchema.safeParse('123456789.99').success).toBe(true);

      // Rejects JavaScript numbers
      expect(MoneySchema.safeParse(15000).success).toBe(false);
      expect(MoneySchema.safeParse(15000.5).success).toBe(false);

      // Rejects more than 2 decimal places
      expect(MoneySchema.safeParse('15000.555').success).toBe(false);

      // Rejects negative numbers or non-numeric strings
      expect(MoneySchema.safeParse('-15000.00').success).toBe(false);
      expect(MoneySchema.safeParse('N15,000').success).toBe(false);
    });

    it('validates hectares, tonnage, volume, and flow rate decimal strings', () => {
      expect(HectaresSchema.safeParse('2.5000').success).toBe(true);
      expect(HectaresSchema.safeParse('10').success).toBe(true);
      expect(HectaresSchema.safeParse('2.12345').success).toBe(false); // Max 4 decimals

      expect(TonnageSchema.safeParse('12.345').success).toBe(true);
      expect(TonnageSchema.safeParse('12.3456').success).toBe(false); // Max 3 decimals

      expect(VolumeM3Schema.safeParse('500.50').success).toBe(true);
      expect(FlowRateSchema.safeParse('14.2850').success).toBe(true);
    });
  });

  describe('Identity Protection & Masking', () => {
    it('standard identity response only includes last4 and uniquePerPerson; excludes ciphertext and hash', () => {
      const standardIdentity = {
        id: '018f3a5e-1000-7000-8000-000000000001',
        farmerId: '018f3a5e-2000-7000-8000-000000000001',
        documentTypeId: '018f3a5e-3000-7000-8000-000000000001',
        numberLast4: '4819',
        bankName: 'First Bank of Nigeria',
        documentFileId: null,
        uniquePerPerson: true,
        version: 1,
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = FarmerIdentityResponseSchema.parse(standardIdentity);
      expect(parsed.numberLast4).toBe('4819');
      expect(parsed.uniquePerPerson).toBe(true);
      expect((parsed as Record<string, unknown>).numberEnc).toBeUndefined();
      expect((parsed as Record<string, unknown>).numberHash).toBeUndefined();
    });

    it('unmasked identity response schema carries cleartext number for authorized slis.identity.view', () => {
      const unmasked = {
        id: '018f3a5e-1000-7000-8000-000000000001',
        farmerId: '018f3a5e-2000-7000-8000-000000000001',
        documentTypeId: '018f3a5e-3000-7000-8000-000000000001',
        number: '12345678901',
        numberLast4: '8901',
        bankName: null,
        documentFileId: null,
        uniquePerPerson: true,
        version: 1,
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = UnmaskedFarmerIdentityResponseSchema.parse(unmasked);
      expect(parsed.number).toBe('12345678901');
    });

    it('validates identity creation input', () => {
      const input = {
        farmerId: '018f3a5e-2000-7000-8000-000000000001',
        documentTypeId: '018f3a5e-3000-7000-8000-000000000001',
        number: '22334455667',
      };
      expect(CreateFarmerIdentityInputSchema.safeParse(input).success).toBe(true);
    });
  });

  describe('Privacy-Preserving Duplicate Check', () => {
    it('accepts duplicate check input parameters', () => {
      const input = {
        schemeId: '018f3a5e-2000-7000-8000-000000000001',
        firstName: 'Aliyu',
        lastName: 'Musa',
        phone: '+2348031234567',
      };
      expect(CheckFarmerDuplicatesInputSchema.safeParse(input).success).toBe(true);
    });

    it('duplicate check response returns detailed in-scope matches but COUNT ONLY for out-of-scope matches', () => {
      const responsePayload = {
        hasDuplicate: true,
        inScopeMatches: [
          {
            id: '018f3a5e-1000-7000-8000-000000000001',
            farmerCode: 'KRIS-001',
            firstName: 'Aliyu',
            lastName: 'Musa',
            village: 'Kadawa',
            wardId: '018f3a5e-2000-7000-8000-000000000002',
            schemeId: '018f3a5e-2000-7000-8000-000000000001',
          },
        ],
        outOfScopeMatchesCount: 3,
      };

      const parsed = CheckFarmerDuplicatesResponseSchema.parse(responsePayload);
      expect(parsed.hasDuplicate).toBe(true);
      expect(parsed.inScopeMatches.length).toBe(1);
      expect(parsed.inScopeMatches[0].firstName).toBe('Aliyu');
      expect(parsed.outOfScopeMatchesCount).toBe(3);
      // Ensures no out-of-scope records or leakages exist in response structure
      expect((parsed as Record<string, unknown>).outOfScopeMatches).toBeUndefined();
    });
  });

  describe('GeoJSON Geometries & PostGIS Plot Shapes', () => {
    it('validates GeoJSON Point coordinates in WGS84 range', () => {
      const validPoint = {
        type: 'Point',
        coordinates: [8.52, 11.98], // Kano longitude, latitude
      };
      expect(GeoJsonPointSchema.safeParse(validPoint).success).toBe(true);

      const invalidPoint = {
        type: 'Point',
        coordinates: [200, 11.98], // Longitude > 180 invalid
      };
      expect(GeoJsonPointSchema.safeParse(invalidPoint).success).toBe(false);
    });

    it('validates GeoJSON Polygon and MultiPolygon coordinates structure', () => {
      const validPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [8.5, 11.9],
            [8.55, 11.9],
            [8.55, 11.95],
            [8.5, 11.95],
            [8.5, 11.9],
          ],
        ],
      };
      expect(GeoJsonPolygonSchema.safeParse(validPolygon).success).toBe(true);

      const validMultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [validPolygon.coordinates],
      };
      expect(GeoJsonMultiPolygonSchema.safeParse(validMultiPolygon).success).toBe(true);
    });

    it('validates farmer and plot creation and response contracts', () => {
      const farmerInput = {
        schemeId: '018f3a5e-1000-7000-8000-000000000001',
        wardId: '018f3a5e-2000-7000-8000-000000000001',
        farmerCode: 'KRIS-F-001',
        firstName: 'Amina',
        lastName: 'Bello',
        gender: 'female',
        village: 'Kadawa',
      };
      expect(CreateFarmerInputSchema.safeParse(farmerInput).success).toBe(true);

      const plotInput = {
        schemeId: '018f3a5e-1000-7000-8000-000000000001',
        sectorId: '018f3a5e-2000-7000-8000-000000000001',
        plotCode: 'PL-KRIS-01',
        serviceType: 'new',
        geom: {
          type: 'Point',
          coordinates: [8.52, 11.98],
        },
      };
      expect(CreatePlotInputSchema.safeParse(plotInput).success).toBe(true);

      const plotResponse = {
        id: '018f3a5e-3000-7000-8000-000000000001',
        schemeId: '018f3a5e-1000-7000-8000-000000000001',
        sectorId: '018f3a5e-2000-7000-8000-000000000001',
        plotCode: 'PL-KRIS-01',
        serviceType: 'new',
        areaHa: '2.50',
        geom: plotInput.geom,
        wardId: null,
        stateId: null,
        farmId: null,
        irrigationTypeId: null,
        status: 'submitted',
        submittedBy: '018f3a5e-4000-7000-8000-000000000001',
        submittedAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        returnedBy: null,
        returnedAt: null,
        returnComment: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(PlotResponseSchema.safeParse(plotResponse).success).toBe(true);
    });
  });

  describe('One-Of Business Constraints', () => {
    it('enforces water request individual vs group one-of rule', () => {
      // Valid individual request: has farmerId, lacks wuaId
      expect(
        CreateWaterRequestInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          level: 'individual',
          farmerId: '018f3a5e-2000-7000-8000-000000000001',
        }).success,
      ).toBe(true);

      // Invalid individual request: has wuaId
      expect(
        CreateWaterRequestInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          level: 'individual',
          farmerId: '018f3a5e-2000-7000-8000-000000000001',
          wuaId: '018f3a5e-3000-7000-8000-000000000001',
        }).success,
      ).toBe(false);

      // Valid sector request: has wuaId, lacks farmerId
      expect(
        CreateWaterRequestInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          level: 'sector',
          wuaId: '018f3a5e-3000-7000-8000-000000000001',
        }).success,
      ).toBe(true);

      // Invalid sector request: has farmerId
      expect(
        CreateWaterRequestInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          level: 'sector',
          wuaId: '018f3a5e-3000-7000-8000-000000000001',
          farmerId: '018f3a5e-2000-7000-8000-000000000001',
        }).success,
      ).toBe(false);
    });

    it('enforces fee billing and collection one-of rule (wuaId XOR farmerId)', () => {
      // Valid farmer billing
      expect(
        CreateFeeBillingInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          farmerId: '018f3a5e-3000-7000-8000-000000000001',
          amountNgn: '15000.00',
        }).success,
      ).toBe(true);

      // Invalid billing: both provided
      expect(
        CreateFeeBillingInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          farmerId: '018f3a5e-3000-7000-8000-000000000001',
          wuaId: '018f3a5e-4000-7000-8000-000000000001',
          amountNgn: '15000.00',
        }).success,
      ).toBe(false);

      // Invalid billing: neither provided
      expect(
        CreateFeeBillingInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          amountNgn: '15000.00',
        }).success,
      ).toBe(false);
    });

    it('requires fieldReceiptRef on fee collection when deviceId is present', () => {
      // Valid device collection with fieldReceiptRef
      expect(
        CreateFeeCollectionInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          farmerId: '018f3a5e-3000-7000-8000-000000000001',
          amountNgn: '5000.00',
          paidOn: '2026-03-15',
          deviceId: '018f3a5e-5000-7000-8000-000000000001',
          fieldReceiptRef: 'PB-1042',
        }).success,
      ).toBe(true);

      // Invalid device collection: missing fieldReceiptRef
      expect(
        CreateFeeCollectionInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          farmerId: '018f3a5e-3000-7000-8000-000000000001',
          amountNgn: '5000.00',
          paidOn: '2026-03-15',
          deviceId: '018f3a5e-5000-7000-8000-000000000001',
        }).success,
      ).toBe(false);

      // Valid web collection without deviceId and without fieldReceiptRef
      expect(
        CreateFeeCollectionInputSchema.safeParse({
          schemeId: '018f3a5e-1000-7000-8000-000000000001',
          seasonId: '018f3a5e-2000-7000-8000-000000000001',
          farmerId: '018f3a5e-3000-7000-8000-000000000001',
          amountNgn: '5000.00',
          paidOn: '2026-03-15',
        }).success,
      ).toBe(true);
    });
  });

  describe('Review Workflow Contracts', () => {
    it('requires a non-empty comment when returning a record', () => {
      expect(
        ReturnRecordInputSchema.safeParse({ comment: 'Plot boundary incomplete' }).success,
      ).toBe(true);
      expect(ReturnRecordInputSchema.safeParse({ comment: '' }).success).toBe(false);
      expect(ReturnRecordInputSchema.safeParse({}).success).toBe(false);
    });

    it('validates bulk approval input and partial-success response shapes', () => {
      const bulkInput = {
        items: [
          { entity: 'farmer', id: '018f3a5e-1000-7000-8000-000000000001' },
          { entity: 'plot', id: '018f3a5e-2000-7000-8000-000000000001' },
        ],
      };
      expect(BulkApproveInputSchema.safeParse(bulkInput).success).toBe(true);

      const bulkResponse = {
        succeeded: ['018f3a5e-1000-7000-8000-000000000001'],
        failed: [
          {
            id: '018f3a5e-2000-7000-8000-000000000001',
            entity: 'plot',
            reason: 'Plot is outside caller authorized scheme scope',
          },
        ],
      };
      expect(BulkApproveResponseSchema.safeParse(bulkResponse).success).toBe(true);
    });
  });

  describe('Offline Sync Protocol Contracts', () => {
    it('validates safe snapshot composite cursor format "xid:seq"', () => {
      expect(SyncCursorSchema.safeParse('10452:389').success).toBe(true);
      expect(SyncCursorSchema.safeParse('0:1').success).toBe(true);
      expect(SyncCursorSchema.safeParse('123456789:99999').success).toBe(true);

      // Rejects plain sequence numbers or non-composite formats
      expect(SyncCursorSchema.safeParse('10452').success).toBe(false);
      expect(SyncCursorSchema.safeParse('cursor-10452').success).toBe(false);
      expect(SyncCursorSchema.safeParse('').success).toBe(false);
    });

    it('validates sync push payload with caps and per-op outcomes', () => {
      const pushPayload = {
        deviceId: '018f3a5e-1000-7000-8000-000000000001',
        ops: [
          {
            opId: '018f3a5e-2000-7000-8000-000000000001',
            entity: 'farmer',
            action: 'create',
            recordId: '018f3a5e-3000-7000-8000-000000000001',
            baseVersion: 1,
            data: { firstName: 'Aliyu', lastName: 'Musa' },
          },
        ],
      };
      expect(SyncPushInputSchema.safeParse(pushPayload).success).toBe(true);

      const pushResponse = {
        results: [
          {
            opId: '018f3a5e-2000-7000-8000-000000000001',
            entity: 'farmer',
            recordId: '018f3a5e-3000-7000-8000-000000000001',
            outcome: 'quarantined',
            quarantineId: '018f3a5e-4000-7000-8000-000000000001',
            quarantineReason: 'grant_expired',
          },
        ],
        serverTime: new Date().toISOString(),
      };
      expect(SyncPushResponseSchema.safeParse(pushResponse).success).toBe(true);
    });

    it('validates sync pull response with rebaseline signals', () => {
      const pullResponse = {
        items: [
          {
            xid: '10042',
            seq: 15,
            entity: 'farmer',
            recordId: '018f3a5e-3000-7000-8000-000000000001',
            op: 'upsert',
            schemeId: '018f3a5e-1000-7000-8000-000000000001',
            stateId: '018f3a5e-2000-7000-8000-000000000001',
            data: { farmerCode: 'KRIS-001', firstName: 'Ibrahim' },
          },
        ],
        nextCursor: '10042:15',
        hasMore: false,
        rebaseline: true,
        activeSchemeIds: ['018f3a5e-1000-7000-8000-000000000001'],
      };
      expect(SyncPullResponseSchema.safeParse(pullResponse).success).toBe(true);
    });
  });

  describe('Reports & Materialized Views Shapes', () => {
    it('validates farmers by scope, area by service, cropping, and fee recovery reporting shapes', () => {
      const farmersReport = {
        items: [
          {
            schemeId: '018f3a5e-1000-7000-8000-000000000001',
            sectorId: null,
            stateId: '018f3a5e-2000-7000-8000-000000000001',
            gender: 'female',
            farmerCount: 350,
          },
        ],
        totalFarmers: 350,
      };
      expect(FarmersByScopeResponseSchema.safeParse(farmersReport).success).toBe(true);

      const areaReport = {
        items: [
          {
            schemeId: '018f3a5e-1000-7000-8000-000000000001',
            stateId: '018f3a5e-2000-7000-8000-000000000001',
            serviceType: 'new',
            totalAreaHa: '1250.50',
            plotCount: 600,
          },
        ],
        totalAreaHa: '1250.50',
        totalPlots: 600,
      };
      expect(AreaByServiceResponseSchema.safeParse(areaReport).success).toBe(true);

      const croppingReport = {
        items: [
          {
            schemeId: '018f3a5e-1000-7000-8000-000000000001',
            cropTypeId: '018f3a5e-3000-7000-8000-000000000001',
            seasonId: '018f3a5e-4000-7000-8000-000000000001',
            totalAreaHa: '500.00',
            totalYieldT: '1500.00',
            avgYieldTHa: '3.00',
          },
        ],
        totalCroppedAreaHa: '500.00',
      };
      expect(CroppingResponseSchema.safeParse(croppingReport).success).toBe(true);

      const feeRecoveryReport = {
        items: [
          {
            schemeId: '018f3a5e-1000-7000-8000-000000000001',
            wuaId: null,
            seasonId: '018f3a5e-3000-7000-8000-000000000001',
            billedNgn: '1000000.00',
            collectedNgn: '850000.00',
            recoveryRatePct: '85.00',
          },
        ],
        totalBilledNgn: '1000000.00',
        totalCollectedNgn: '850000.00',
        overallRecoveryRatePct: '85.00',
      };
      expect(FeeRecoveryResponseSchema.safeParse(feeRecoveryReport).success).toBe(true);
    });
  });

  describe('Import Definitions & Template Columns', () => {
    it('registers templates for all 7 SLIS importable datasets', () => {
      const datasets = [
        'slis.farmer',
        'slis.plot',
        'slis.fee_billing',
        'slis.fee_collection',
        'slis.water_request',
        'slis.crop_production',
        'slis.training',
      ] as const;

      for (const ds of datasets) {
        expect(SLIS_IMPORT_TEMPLATES[ds]).toBeDefined();
        expect(SLIS_IMPORT_TEMPLATES[ds].length).toBeGreaterThan(0);
      }
    });

    it('validates import row schemas for farmer and fee collection', () => {
      const farmerRow = {
        farmerCode: 'F-001',
        firstName: 'Musa',
        lastName: 'Ibrahim',
        gender: 'male',
        birthYear: 1980,
        phone: '+2348031234567',
        identityNumber: '12345678901',
        documentTypeKey: 'nin',
      };
      expect(FarmerImportRowSchema.safeParse(farmerRow).success).toBe(true);

      const feeCollectionRow = {
        seasonName: 'Dry Season 2026',
        targetType: 'farmer',
        targetCode: 'F-001',
        amountNgn: '25000.00',
        paidOn: '2026-03-20',
        fieldReceiptRef: 'DEV-KANO-01-00042',
      };
      expect(FeeCollectionImportRowSchema.safeParse(feeCollectionRow).success).toBe(true);
    });
  });

  describe('Permissions Catalogue & Scope Kinds', () => {
    it('classifies every SLIS permission as strictly scoped', () => {
      const slisPerms = Object.values(permissions).filter((p) => p.startsWith('slis.'));
      expect(slisPerms.length).toBeGreaterThanOrEqual(18);

      for (const perm of slisPerms) {
        expect(permissionKinds[perm]).toBe('scoped');
      }
    });
  });
});
