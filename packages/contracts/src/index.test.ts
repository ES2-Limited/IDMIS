import { describe, it, expect } from 'vitest';
import {
  permissions,
  ORG_TYPES,
  OrgTypeSchema,
  WUA_LEVELS,
  WuaLevelSchema,
  SCOPE_TYPES,
  ScopeTypeSchema,
  RECORD_STATUSES,
  RecordStatusSchema,
  MODULE_KEYS,
  ModuleKeySchema,
  WUA_OFFICES,
  WuaOfficeSchema,
  FILE_SCAN_STATUSES,
  FileScanStatusSchema,
  AppUserResponseSchema,
  CreateAssignmentInputSchema,
  CreateWuaOfficerInputSchema,
  StateResponseSchema,
  WuaResponseSchema,
} from './index';

describe('contracts package', () => {
  describe('permissions', () => {
    it('declares all required core permissions', () => {
      expect(permissions.CORE_USER_READ).toBe('core.user.read');
      expect(permissions.CORE_USER_CREATE).toBe('core.user.create');
      expect(permissions.CORE_USER_UPDATE).toBe('core.user.update');
      expect(permissions.CORE_USER_DEACTIVATE).toBe('core.user.deactivate');
      expect(permissions.CORE_ASSIGNMENT_MANAGE).toBe('core.assignment.manage');
      expect(permissions.CORE_ORGANISATION_READ).toBe('core.organisation.read');
      expect(permissions.CORE_ORGANISATION_MANAGE).toBe('core.organisation.manage');
      expect(permissions.CORE_WUA_READ).toBe('core.wua.read');
      expect(permissions.CORE_WUA_MANAGE).toBe('core.wua.manage');
      expect(permissions.CORE_LOOKUP_READ).toBe('core.lookup.read');
      expect(permissions.CORE_LOOKUP_MANAGE).toBe('core.lookup.manage');
      expect(permissions.CORE_SETTING_MANAGE).toBe('core.setting.manage');
      expect(permissions.CORE_IMPORT_RUN).toBe('core.import.run');
      expect(permissions.CORE_AUDIT_READ).toBe('core.audit.read');
      expect(permissions.CORE_FILE_UPLOAD).toBe('core.file.upload');
    });
  });

  describe('enum arrays match Zod enums', () => {
    const enumPairs = [
      { name: 'ORG_TYPES', array: ORG_TYPES, schema: OrgTypeSchema },
      { name: 'WUA_LEVELS', array: WUA_LEVELS, schema: WuaLevelSchema },
      { name: 'SCOPE_TYPES', array: SCOPE_TYPES, schema: ScopeTypeSchema },
      { name: 'RECORD_STATUSES', array: RECORD_STATUSES, schema: RecordStatusSchema },
      { name: 'MODULE_KEYS', array: MODULE_KEYS, schema: ModuleKeySchema },
      { name: 'WUA_OFFICES', array: WUA_OFFICES, schema: WuaOfficeSchema },
      { name: 'FILE_SCAN_STATUSES', array: FILE_SCAN_STATUSES, schema: FileScanStatusSchema },
    ];

    for (const { name, array, schema } of enumPairs) {
      it(`verifies ${name} matches its Zod schema options`, () => {
        expect(schema.options).toEqual(array);
        for (const val of array) {
          expect(schema.safeParse(val).success).toBe(true);
        }
        expect(schema.safeParse('__invalid_value__').success).toBe(false);
      });
    }
  });

  describe('AppUserResponse security', () => {
    const validUser = {
      id: '018f3a5e-1111-7000-8000-000000000001',
      version: 1,
      createdAt: '2026-10-20T10:00:00Z',
      createdBy: '018f3a5e-0000-7000-8000-000000000001',
      updatedAt: '2026-10-20T10:00:00Z',
      updatedBy: '018f3a5e-0000-7000-8000-000000000001',
      deletedAt: null,
      email: 'admin@idmis.gov.ng',
      username: 'sysadmin',
      fullName: 'System Administrator',
      phone: '+2348012345678',
      isActive: true,
      failedSignIns: 0,
      lockedUntil: null,
      lastSignInAt: null,
    };

    it('parses a clean user response', () => {
      const parsed = AppUserResponseSchema.parse(validUser);
      expect(parsed.email).toBe('admin@idmis.gov.ng');
      expect(parsed.mustChangePassword).toBe(false);
    });

    it('strips passwordHash and totpSecretEnc if present in user response payload', () => {
      const payloadWithSecrets = {
        ...validUser,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        totpSecretEnc: 'secret-bytes',
      };
      const parsed = AppUserResponseSchema.parse(payloadWithSecrets);
      expect(parsed).not.toHaveProperty('passwordHash');
      expect(parsed).not.toHaveProperty('totpSecretEnc');
      expect(parsed.email).toBe('admin@idmis.gov.ng');
    });
  });

  describe('Assignment refinements', () => {
    const baseAssignment = {
      id: '018f3a5e-1111-7000-8000-000000000002',
      userId: '018f3a5e-0000-7000-8000-000000000002',
      roleId: '018f3a5e-0000-7000-8000-000000000003',
      module: 'core' as const,
      canCaptureOffline: false,
    };

    it('validates scope type combinations', () => {
      // National: no scope IDs
      expect(
        CreateAssignmentInputSchema.safeParse({
          ...baseAssignment,
          scopeType: 'national',
        }).success,
      ).toBe(true);

      // National with scopeStateId fails
      expect(
        CreateAssignmentInputSchema.safeParse({
          ...baseAssignment,
          scopeType: 'national',
          scopeStateId: '018f3a5e-1111-7000-8000-000000000001',
        }).success,
      ).toBe(false);

      // State: requires scopeStateId only
      expect(
        CreateAssignmentInputSchema.safeParse({
          ...baseAssignment,
          scopeType: 'state',
          scopeStateId: '018f3a5e-1111-7000-8000-000000000001',
        }).success,
      ).toBe(true);

      // State without scopeStateId fails
      expect(
        CreateAssignmentInputSchema.safeParse({
          ...baseAssignment,
          scopeType: 'state',
        }).success,
      ).toBe(false);

      // Scheme: requires scopeOrgId only
      expect(
        CreateAssignmentInputSchema.safeParse({
          ...baseAssignment,
          scopeType: 'scheme',
          scopeOrgId: '018f3a5e-2222-7000-8000-000000000001',
        }).success,
      ).toBe(true);
    });

    it('validates date range refinement (validFromOn <= validToOn)', () => {
      // Valid ascending range
      const validRange = CreateAssignmentInputSchema.safeParse({
        ...baseAssignment,
        scopeType: 'national',
        validFromOn: '2026-01-01',
        validToOn: '2026-12-31',
      });
      expect(validRange.success).toBe(true);

      // Equal dates pass
      const equalDates = CreateAssignmentInputSchema.safeParse({
        ...baseAssignment,
        scopeType: 'national',
        validFromOn: '2026-06-01',
        validToOn: '2026-06-01',
      });
      expect(equalDates.success).toBe(true);

      // Inverted range fails
      const invertedRange = CreateAssignmentInputSchema.safeParse({
        ...baseAssignment,
        scopeType: 'national',
        validFromOn: '2026-12-31',
        validToOn: '2026-01-01',
      });
      expect(invertedRange.success).toBe(false);
      if (!invertedRange.success) {
        expect(invertedRange.error.issues[0]?.message).toContain(
          'validFromOn must be before or equal to validToOn',
        );
      }

      // Single date passes
      const singleDate = CreateAssignmentInputSchema.safeParse({
        ...baseAssignment,
        scopeType: 'national',
        validFromOn: '2026-01-01',
      });
      expect(singleDate.success).toBe(true);
    });
  });

  describe('WUA officer date-range refinement', () => {
    it('validates fromOn <= toOn', () => {
      const valid = CreateWuaOfficerInputSchema.safeParse({
        wuaId: '018f3a5e-1111-7000-8000-000000000001',
        office: 'chair',
        fullName: 'Ibrahim Musa',
        fromOn: '2026-01-01',
        toOn: '2026-12-31',
      });
      expect(valid.success).toBe(true);

      const invalid = CreateWuaOfficerInputSchema.safeParse({
        wuaId: '018f3a5e-1111-7000-8000-000000000001',
        office: 'chair',
        fullName: 'Ibrahim Musa',
        fromOn: '2026-12-31',
        toOn: '2026-01-01',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Geography and WUA responses', () => {
    it('StateResponse excludes geom', () => {
      const state = {
        id: '018f3a5e-1111-7000-8000-000000000001',
        version: 1,
        createdAt: '2026-10-20T10:00:00Z',
        createdBy: '018f3a5e-0000-7000-8000-000000000001',
        updatedAt: '2026-10-20T10:00:00Z',
        updatedBy: '018f3a5e-0000-7000-8000-000000000001',
        deletedAt: null,
        code: 'KN',
        name: 'Kano',
      };
      const parsed = StateResponseSchema.parse(state);
      expect(parsed).not.toHaveProperty('geom');
      expect(parsed.code).toBe('KN');
    });

    it('WuaResponse masks bank account to bankAccountLast4', () => {
      const wua = {
        id: '018f3a5e-1111-7000-8000-000000000001',
        version: 1,
        createdAt: '2026-10-20T10:00:00Z',
        createdBy: '018f3a5e-0000-7000-8000-000000000001',
        updatedAt: '2026-10-20T10:00:00Z',
        updatedBy: '018f3a5e-0000-7000-8000-000000000001',
        deletedAt: null,
        level: 'apex' as const,
        parentId: null,
        organisationId: '018f3a5e-2222-7000-8000-000000000001',
        wardId: null,
        regNo: 'WUA-001',
        name: 'Kano River Apex WUA',
        address: 'Kadawa, Kano',
        bankName: 'First Bank of Nigeria',
        bankAccountLast4: '5678',
        isOperational: true,
        hasMaintenanceFund: true,
      };
      const parsed = WuaResponseSchema.parse(wua);
      expect(parsed.bankAccountLast4).toBe('5678');
      expect(parsed).not.toHaveProperty('bankAccountEnc');
    });
  });
});
