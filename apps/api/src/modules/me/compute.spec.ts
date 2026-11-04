import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { permissions, IndicatorMatrixRow } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  state,
  organisation,
  organisationState,
  wua,
  lookupType,
  lookupValue,
  farmer,
  plot,
  season,
  cropProduction,
  feeBilling,
  feeCollection,
  training,
  trainingAttendance,
  scorecard,
  techAdoption,
  survey,
  surveyQuestion,
  surveyResponse,
  surveyAnswer,
  indicator,
  indicatorValue,
  indicatorTarget,
  computeResult,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { MeComputeService } from './services/me-compute.service';
import { ComputeRegistry } from './compute/compute.registry';
import { IndicatorMatrixRepository } from './repositories/indicator-matrix.repository';
import { IndicatorValueRepository } from './repositories/indicator-value.repository';
import { loadMeIndicators } from '@idmis/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M&E Computed Indicators, Compute Results & Indicator Matrix (BE-3.3)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;
  let computeService: MeComputeService;
  let computeRegistry: ComputeRegistry;
  let matrixRepo: IndicatorMatrixRepository;
  let valueRepo: IndicatorValueRepository;

  const TEST_DB_NAME = `idmis_test_me_compute_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test User IDs
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const KANO_STATE_OFFICER_ID = crypto.randomUUID();
  const KANO_SCHEME_OFFICER_ID = crypto.randomUUID();
  const LAGOS_SCHEME_OFFICER_ID = crypto.randomUUID();

  // Role IDs
  const NATIONAL_ADMIN_ROLE_ID = crypto.randomUUID();
  const STATE_OFFICER_ROLE_ID = crypto.randomUUID();
  const SCHEME_OFFICER_ROLE_ID = crypto.randomUUID();

  // Geography, Scheme & Sector IDs
  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();
  const LAGOS_SCHEME_ID = crypto.randomUUID();
  const KANO_SECTOR_ID = crypto.randomUUID();
  const KANO_WUA_ID = crypto.randomUUID();
  const P1_ID = crypto.randomUUID();

  // Lookups & Seasons
  const CROP_TYPE_ID = crypto.randomUUID();
  const RICE_CROP_ID = crypto.randomUUID();
  const TOMATO_CROP_ID = crypto.randomUUID();
  const TECH_TYPE_ID = crypto.randomUUID();
  const DRIP_TECH_ID = crypto.randomUUID();
  const SEASON_2026_ID = crypto.randomUUID();

  // Tokens
  let nationalAdminToken: string;
  let kanoStateOfficerToken: string;
  let kanoSchemeOfficerToken: string;
  let lagosSchemeOfficerToken: string;

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;

    // Apply migrations
    const { migrate } = await import('@idmis/db');
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    const { initAuditWriter } = await import('../../platform/audit/audit-writer');
    initAuditWriter();

    // 2. Initialize Nest Application
    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: ['error', 'warn'],
    });
    const { ProblemDetailsFilter } = await import('../../platform/filters/problem-details.filter');
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
    computeService = app.get(MeComputeService);
    computeRegistry = app.get(ComputeRegistry);
    matrixRepo = app.get(IndicatorMatrixRepository);
    valueRepo = app.get(IndicatorValueRepository);

    // 3. Seed Base Data
    // Users
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System User',
        passwordHash: 'irrelevant',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: NATIONAL_ADMIN_ID,
        email: 'admin@idmis.gov.ng',
        fullName: 'National Admin',
        passwordHash: 'irrelevant',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_STATE_OFFICER_ID,
        email: 'kano.state@idmis.gov.ng',
        fullName: 'Kano State Officer',
        passwordHash: 'irrelevant',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SCHEME_OFFICER_ID,
        email: 'kano.scheme@idmis.gov.ng',
        fullName: 'Kano Scheme Officer',
        passwordHash: 'irrelevant',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_OFFICER_ID,
        email: 'lagos.scheme@idmis.gov.ng',
        fullName: 'Lagos Scheme Officer',
        passwordHash: 'irrelevant',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Geography
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_ID,
        code: 'LA',
        name: 'Lagos State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Schemes & Sector
    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        type: 'scheme',
        irrigableAreaHa: '1000.0000',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        code: 'LRIS',
        name: 'Lagos Irrigation Scheme',
        type: 'scheme',
        irrigableAreaHa: '500.0000',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_ID,
        code: 'K-SEC-1',
        name: 'Kano Sector 1',
        type: 'sector',
        parentId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // Base WUA in Kano
    await testDb.insert(wua).values({
      id: KANO_WUA_ID,
      level: 'unit',
      organisationId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
      regNo: 'WUA-K1',
      name: 'Kano Base WUA K1',
      isOperational: true,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Lookups
    await testDb
      .insert(lookupType)
      .values([
        {
          id: CROP_TYPE_ID,
          key: 'crop_type',
          name: 'Crop Type',
          module: 'slis',
          isSystem: true,
        },
        {
          id: TECH_TYPE_ID,
          key: 'technology_type',
          name: 'Technology Type',
          module: 'me',
          isSystem: true,
        },
      ])
      .onConflictDoNothing();

    const [cropTypeRow] = await testDb
      .select({ id: lookupType.id })
      .from(lookupType)
      .where(eq(lookupType.key, 'crop_type'))
      .limit(1);

    await testDb
      .insert(lookupValue)
      .values([
        {
          id: RICE_CROP_ID,
          lookupTypeId: cropTypeRow!.id,
          code: 'rice',
          label: 'Rice',
          sortOrder: 1,
        },
        {
          id: TOMATO_CROP_ID,
          lookupTypeId: cropTypeRow!.id,
          code: 'tomato',
          label: 'Tomato',
          sortOrder: 2,
        },
      ])
      .onConflictDoNothing();

    const [techTypeRow] = await testDb
      .select({ id: lookupType.id })
      .from(lookupType)
      .where(eq(lookupType.key, 'technology_type'))
      .limit(1);

    await testDb
      .insert(lookupValue)
      .values([
        {
          id: DRIP_TECH_ID,
          lookupTypeId: techTypeRow!.id,
          code: 'drip_irrigation',
          label: 'Drip Irrigation',
          sortOrder: 1,
        },
      ])
      .onConflictDoNothing();

    // Roles & Permissions
    await testDb.insert(role).values([
      {
        id: NATIONAL_ADMIN_ROLE_ID,
        key: 'national_admin',
        name: 'National Admin',
        description: 'National Admin',
      },
      {
        id: STATE_OFFICER_ROLE_ID,
        key: 'state_officer',
        name: 'State Officer',
        description: 'State Officer',
      },
      {
        id: SCHEME_OFFICER_ROLE_ID,
        key: 'scheme_officer',
        name: 'Scheme Officer',
        description: 'Scheme Officer',
      },
    ]);

    const adminPerms = [
      permissions.ME_INDICATOR_MANAGE,
      permissions.ME_INDICATOR_READ,
      permissions.ME_VALUE_SUBMIT,
      permissions.ME_VALUE_APPROVE,
    ];
    for (const p of adminPerms) {
      await testDb.insert(rolePermission).values({ roleId: NATIONAL_ADMIN_ROLE_ID, permission: p });
    }

    const officerPerms = [permissions.ME_INDICATOR_READ, permissions.ME_VALUE_SUBMIT];
    for (const p of officerPerms) {
      await testDb.insert(rolePermission).values({ roleId: STATE_OFFICER_ROLE_ID, permission: p });
      await testDb.insert(rolePermission).values({ roleId: SCHEME_OFFICER_ROLE_ID, permission: p });
    }

    // Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: NATIONAL_ADMIN_ID,
        roleId: NATIONAL_ADMIN_ROLE_ID,
        module: 'me',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_STATE_OFFICER_ID,
        roleId: STATE_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_SCHEME_OFFICER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: LAGOS_SCHEME_OFFICER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: LAGOS_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Sessions & Tokens
    const createSession = async (userId: string) => {
      const sessionId = crypto.randomUUID();
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      await testDb.insert(session).values({
        id: sessionId,
        familyId,
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt,
      });
      return (await tokenService.createAccessToken(userId, sessionId)).accessToken;
    };

    nationalAdminToken = await createSession(NATIONAL_ADMIN_ID);
    kanoStateOfficerToken = await createSession(KANO_STATE_OFFICER_ID);
    kanoSchemeOfficerToken = await createSession(KANO_SCHEME_OFFICER_ID);
    lagosSchemeOfficerToken = await createSession(LAGOS_SCHEME_OFFICER_ID);

    // Seed all 22 M&E provisional indicators
    await loadMeIndicators(
      undefined,
      undefined,
      testDb as unknown as Parameters<typeof loadMeIndicators>[2],
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testClient) {
      await testClient.end();
    }
    if (adminClient) {
      try {
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      } catch {
        // ignore
      }
      await adminClient.end();
    }
  });

  describe('1. Individual Compute Key Formulas and Known Input Rows', () => {
    it('computes 1a & 1b: direct beneficiaries and female percentage with gender breakdown', async () => {
      // Seed farmers: 1 female approved, 1 male approved in Kano; 1 female approved in Lagos; 1 draft in Kano
      await testDb.insert(farmer).values([
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          stateId: KANO_STATE_ID,
          farmerCode: 'K-001',
          firstName: 'Amina',
          lastName: 'Lawal',
          gender: 'female',
          phone: '08011111111',
          status: 'approved',
          createdAt: '2026-02-01T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          stateId: KANO_STATE_ID,
          farmerCode: 'K-002',
          firstName: 'Usman',
          lastName: 'Garba',
          gender: 'male',
          phone: '08022222222',
          status: 'approved',
          createdAt: '2026-02-15T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          stateId: KANO_STATE_ID,
          farmerCode: 'K-003',
          firstName: 'Fatima',
          lastName: 'Draft',
          gender: 'female',
          phone: '08033333333',
          status: 'submitted', // unapproved, must not be counted
          createdAt: '2026-02-20T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: LAGOS_SCHEME_ID,
          stateId: LAGOS_STATE_ID,
          farmerCode: 'L-001',
          firstName: 'Folake',
          lastName: 'Ade',
          gender: 'female',
          phone: '08044444444',
          status: 'approved',
          createdAt: '2026-02-10T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      // Kano Scheme Scope
      const kanoBeneficiaries = await computeRegistry.execute('slis.beneficiaries', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });

      // Total = 2, female = 1, male = 1
      const totalSlot = kanoBeneficiaries.find((s) => Object.keys(s.disaggregation).length === 0);
      const femaleSlot = kanoBeneficiaries.find((s) => s.disaggregation.gender === 'female');
      const maleSlot = kanoBeneficiaries.find((s) => s.disaggregation.gender === 'male');

      expect(totalSlot?.value).toBe('2');
      expect(femaleSlot?.value).toBe('1');
      expect(maleSlot?.value).toBe('1');
      // Verify female + male == total
      expect(Number(femaleSlot?.value) + Number(maleSlot?.value)).toBe(Number(totalSlot?.value));

      // Kano Scheme Female %
      const kanoPct = await computeRegistry.execute('slis.beneficiaries_female_pct', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(kanoPct[0]?.value).toBe('50.00');

      // National Scope
      const natBeneficiaries = await computeRegistry.execute('slis.beneficiaries', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'national' },
      });
      const natTotal = natBeneficiaries.find((s) => Object.keys(s.disaggregation).length === 0);
      const natFemale = natBeneficiaries.find((s) => s.disaggregation.gender === 'female');
      const natMale = natBeneficiaries.find((s) => s.disaggregation.gender === 'male');
      expect(natTotal?.value).toBe('3');
      expect(natFemale?.value).toBe('2');
      expect(natMale?.value).toBe('1');
      expect(Number(natFemale?.value) + Number(natMale?.value)).toBe(Number(natTotal?.value));

      const natPct = await computeRegistry.execute('slis.beneficiaries_female_pct', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'national' },
      });
      expect(natPct[0]?.value).toBe('66.67');
    });

    it('computes 2a, 2b, 2c: area serviced = area improved + area new', async () => {
      await testDb.insert(plot).values([
        {
          id: P1_ID,
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          stateId: KANO_STATE_ID,
          plotCode: 'P-001',
          areaHa: '55.5000',
          serviceType: 'improved',
          status: 'approved',
          createdAt: '2026-01-10T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          stateId: KANO_STATE_ID,
          plotCode: 'P-002',
          areaHa: '44.5000',
          serviceType: 'new',
          status: 'approved',
          createdAt: '2026-01-15T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          stateId: KANO_STATE_ID,
          plotCode: 'P-003',
          areaHa: '20.0000',
          serviceType: 'new',
          status: 'draft', // unapproved, ignored
          createdAt: '2026-01-20T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      const serviced = await computeRegistry.execute('slis.area_serviced', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      const improved = await computeRegistry.execute('slis.area_improved', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      const areaNew = await computeRegistry.execute('slis.area_new', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });

      expect(improved[0]?.value).toBe('55.5000');
      expect(areaNew[0]?.value).toBe('44.5000');
      expect(serviced[0]?.value).toBe('100.0000');
      expect(Number(improved[0]?.value) + Number(areaNew[0]?.value)).toBe(
        Number(serviced[0]?.value),
      );
    });

    it('computes 3: cropping intensity and returns not_available when irrigable area is zero or null', async () => {
      // 1. Create season in 2026
      await testDb.insert(season).values({
        id: SEASON_2026_ID,
        schemeId: KANO_SCHEME_ID,
        name: '2026 Dry Season',
        startsOn: '2026-01-15',
        endsOn: '2026-05-15',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // 2. Crop production in Kano: 200 ha cropped
      await testDb.insert(cropProduction).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        plotId: P1_ID,
        seasonId: SEASON_2026_ID,
        cropTypeId: RICE_CROP_ID,
        areaHa: '200.0000',
        yieldT: '500.0000',
        status: 'approved',
        createdAt: '2026-02-01T00:00:00Z',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Kano irrigableAreaHa is 1000.0000 -> intensity = 200 / 1000 * 100 = 20.00%
      const resKano = await computeRegistry.execute('slis.cropping_intensity', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: {
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          irrigableAreaHa: '1000.0000',
        },
      });
      expect(resKano[0]?.status).toBe('computed');
      expect(resKano[0]?.value).toBe('20.00');

      // Scheme with null irrigable area -> not_available
      const resNoIrrigable = await computeRegistry.execute('slis.cropping_intensity', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: {
          scopeType: 'scheme',
          scopeOrgId: LAGOS_SCHEME_ID,
          irrigableAreaHa: null,
        },
      });
      expect(resNoIrrigable[0]?.status).toBe('not_available');
      expect(resNoIrrigable[0]?.value).toBeNull();
    });

    it('computes 4: fee recovery rate and returns not_available when billing is zero', async () => {
      // When billing is 0 -> not_available
      const zeroBilling = await computeRegistry.execute('slis.fee_recovery_rate', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(zeroBilling[0]?.status).toBe('not_available');
      expect(zeroBilling[0]?.value).toBeNull();

      // Seed Billing and Collection
      await testDb.insert(feeBilling).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        seasonId: SEASON_2026_ID,
        wuaId: KANO_WUA_ID,
        amountNgn: '100000.00',
        dueDate: '2026-04-01',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(feeCollection).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        seasonId: SEASON_2026_ID,
        wuaId: KANO_WUA_ID,
        amountNgn: '85000.00',
        paidOn: '2026-02-15',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // 85,000 / 100,000 * 100 = 85.00%
      const resWithBilling = await computeRegistry.execute('slis.fee_recovery_rate', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(resWithBilling[0]?.status).toBe('computed');
      expect(resWithBilling[0]?.value).toBe('85.00');
    });

    it('computes 6: staff trained in dam safety assurance and management with gender breakdown', async () => {
      const trainingId = crypto.randomUUID();
      await testDb.insert(training).values({
        id: trainingId,
        schemeId: KANO_SCHEME_ID,
        topic: 'Dam Structural Safety Workshop',
        heldOn: '2026-02-10',
        status: 'approved',
        tags: ['dam_safety'],
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(trainingAttendance).values([
        {
          id: crypto.randomUUID(),
          trainingId,
          staffName: 'Halima Sani',
          gender: 'female',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          trainingId,
          staffName: 'Aliyu Umar',
          gender: 'male',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      const res = await computeRegistry.execute('slis.trained_dam_safety', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });

      const total = res.find((s) => Object.keys(s.disaggregation).length === 0);
      const female = res.find((s) => s.disaggregation.gender === 'female');
      const male = res.find((s) => s.disaggregation.gender === 'male');

      expect(total?.value).toBe('2');
      expect(female?.value).toBe('1');
      expect(male?.value).toBe('1');
      expect(Number(female?.value) + Number(male?.value)).toBe(Number(total?.value));
    });

    it('computes 10: operational WUAs created or strengthened', async () => {
      await testDb.insert(wua).values([
        {
          id: crypto.randomUUID(),
          level: 'unit',
          organisationId: KANO_SCHEME_ID,
          stateId: KANO_STATE_ID,
          regNo: 'WUA-01',
          name: 'Kano WUA 1',
          isOperational: true,
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          level: 'unit',
          organisationId: KANO_SCHEME_ID,
          stateId: KANO_STATE_ID,
          regNo: 'WUA-02',
          name: 'Kano WUA 2 (Dormant)',
          isOperational: false, // not operational
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      const res = await computeRegistry.execute('core.wua_operational', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      // 1 from beforeAll + 1 from this test = 2 operational WUAs in Kano
      expect(res[0]?.value).toBe('2');
    });

    it('computes 11: survey indicator wua_participation and handles missing responses', async () => {
      // 1. When no survey responses exist -> not_available
      const noResponses = await computeRegistry.execute('me.survey.wua_participation', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(noResponses[0]?.status).toBe('not_available');
      expect(noResponses[0]?.value).toBeNull();

      // 2. Create survey with questions: wua_participation, gender
      const surveyId = crypto.randomUUID();
      const qWuaId = crypto.randomUUID();
      const qGenderId = crypto.randomUUID();

      await testDb.insert(survey).values({
        id: surveyId,
        schemeId: KANO_SCHEME_ID,
        name: 'WUA Governance Survey 2026',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(surveyQuestion).values([
        {
          id: qWuaId,
          surveyId,
          code: 'wua_participation',
          text: 'Do you participate in WUA affairs?',
          answerType: 'single',
          sortOrder: 1,
        },
        {
          id: qGenderId,
          surveyId,
          code: 'gender',
          text: 'Respondent gender',
          answerType: 'single',
          sortOrder: 2,
        },
      ]);

      // Response 1: female, yes
      const r1 = crypto.randomUUID();
      await testDb.insert(surveyResponse).values({
        id: r1,
        surveyId,
        schemeId: KANO_SCHEME_ID,
        collectedAt: '2026-02-01T10:00:00Z',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(surveyAnswer).values([
        { responseId: r1, questionId: qWuaId, value: 'yes' },
        { responseId: r1, questionId: qGenderId, value: 'female' },
      ]);

      // Response 2: male, no
      const r2 = crypto.randomUUID();
      await testDb.insert(surveyResponse).values({
        id: r2,
        surveyId,
        schemeId: KANO_SCHEME_ID,
        collectedAt: '2026-02-02T10:00:00Z',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(surveyAnswer).values([
        { responseId: r2, questionId: qWuaId, value: 'no' },
        { responseId: r2, questionId: qGenderId, value: 'male' },
      ]);

      // Response 3: female, yes
      const r3 = crypto.randomUUID();
      await testDb.insert(surveyResponse).values({
        id: r3,
        surveyId,
        schemeId: KANO_SCHEME_ID,
        collectedAt: '2026-02-03T10:00:00Z',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(surveyAnswer).values([
        { responseId: r3, questionId: qWuaId, value: 'yes' },
        { responseId: r3, questionId: qGenderId, value: 'female' },
      ]);

      // Total: 2 yes out of 3 = 66.67%
      // Female: 2 yes out of 2 = 100.00%
      // Male: 0 yes out of 1 = 0.00%
      const res = await computeRegistry.execute('me.survey.wua_participation', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });

      const totalSlot = res.find((s) => Object.keys(s.disaggregation).length === 0);
      const femaleSlot = res.find((s) => s.disaggregation.gender === 'female');
      const maleSlot = res.find((s) => s.disaggregation.gender === 'male');

      expect(totalSlot?.value).toBe('66.67');
      expect(femaleSlot?.value).toBe('100.00');
      expect(maleSlot?.value).toBe('0.00');
    });

    it('computes 12 & 13: technology adopters total and female adopters', async () => {
      const farmerFemale = crypto.randomUUID();
      const farmerMale = crypto.randomUUID();
      const farmerUnapproved = crypto.randomUUID();

      await testDb.insert(techAdoption).values([
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerFemale,
          technologyId: DRIP_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-02-01',
          status: 'approved',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerMale,
          technologyId: DRIP_TECH_ID,
          gender: 'male',
          adoptedOn: '2026-02-05',
          status: 'approved',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerUnapproved,
          technologyId: DRIP_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-02-10',
          status: 'submitted', // unapproved, ignored
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      const totalAdopters = await computeRegistry.execute('me.tech_adopters', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      const femaleAdopters = await computeRegistry.execute('me.tech_adopters_female', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });

      expect(totalAdopters[0]?.value).toBe('2');
      expect(femaleAdopters[0]?.value).toBe('1');
    });

    it('computes 14a–14d: crop yields (weighted average yield_t ÷ area_ha) and not_available if area = 0', async () => {
      // Rice: 500.0000 tons on 200.0000 ha = 2.5000 t/ha
      const riceYield = await computeRegistry.execute('slis.yield.rice', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(riceYield[0]?.status).toBe('computed');
      expect(riceYield[0]?.value).toBe('2.5000');

      // Tomato: no production recorded -> not_available
      const tomatoYield = await computeRegistry.execute('slis.yield.tomato', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(tomatoYield[0]?.status).toBe('not_available');
      expect(tomatoYield[0]?.value).toBeNull();
    });

    it('computes 16: scheme scorecards published', async () => {
      await testDb.insert(scorecard).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        periodYear: 2026,
        publishedOn: '2026-02-28',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const kanoScorecards = await computeRegistry.execute('me.scorecards_published', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(kanoScorecards[0]?.value).toBe('1');

      const lagosScorecards = await computeRegistry.execute('me.scorecards_published', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: LAGOS_SCHEME_ID },
      });
      expect(lagosScorecards[0]?.value).toBe('0');
    });

    it('fails loudly for unimplemented compute keys with status error without crashing', async () => {
      const res = await computeRegistry.execute('non_existent_key', {
        year: 2026,
        quarter: 1,
        periodEnd: '2026-03-31',
        scope: { scopeType: 'scheme', scopeOrgId: KANO_SCHEME_ID },
      });
      expect(res[0]?.status).toBe('error');
      expect(res[0]?.message).toContain('Unimplemented compute key: non_existent_key');
    });
  });

  describe('2. Compute Service Runner, Stale Cleanup & Idempotency', () => {
    it('executes runCompute, persists compute_result and indicator_value, and is idempotent on rerun', async () => {
      // Run compute for 2026 Q1
      const firstRun = await computeService.runCompute({ year: 2026, quarter: 1 });
      expect(firstRun.computedCount).toBeGreaterThan(0);

      // Verify rows exist in compute_result
      const results = await testDb
        .select()
        .from(computeResult)
        .where(
          and(
            eq(computeResult.periodYear, 2026),
            eq(computeResult.periodQuarter, 1),
            eq(computeResult.scopeOrgId, KANO_SCHEME_ID),
          ),
        );
      expect(results.length).toBeGreaterThan(0);

      // Verify rows exist in indicator_value with source = 'computed' and status = 'approved'
      const computedValues = await testDb
        .select()
        .from(indicatorValue)
        .where(
          and(
            eq(indicatorValue.periodYear, 2026),
            eq(indicatorValue.periodQuarter, 1),
            eq(indicatorValue.scopeOrgId, KANO_SCHEME_ID),
            eq(indicatorValue.source, 'computed'),
          ),
        );
      expect(computedValues.length).toBeGreaterThan(0);
      for (const val of computedValues) {
        expect(val.status).toBe('approved');
        expect(val.computedAt).not.toBeNull();
      }

      // Re-run compute: count of indicator_value rows must remain identical (no duplicates)
      await computeService.runCompute({ year: 2026, quarter: 1 });

      const rerunComputedValues = await testDb
        .select()
        .from(indicatorValue)
        .where(
          and(
            eq(indicatorValue.periodYear, 2026),
            eq(indicatorValue.periodQuarter, 1),
            eq(indicatorValue.scopeOrgId, KANO_SCHEME_ID),
            eq(indicatorValue.source, 'computed'),
          ),
        );
      expect(rerunComputedValues.length).toBe(computedValues.length);
    });

    it('slot going from computed -> not_available deletes stale computed value from indicator_value', async () => {
      // 1. Find the indicator for slis.cropping_intensity
      const [intensityInd] = await testDb
        .select()
        .from(indicator)
        .where(eq(indicator.computeKey, 'slis.cropping_intensity'))
        .limit(1);

      // Confirm there is an existing computed value in indicator_value for Kano scheme
      const existingVal = await valueRepo.findBySlot(
        intensityInd!.id,
        2026,
        1,
        'scheme',
        KANO_STATE_ID,
        KANO_SCHEME_ID,
        {},
      );
      expect(existingVal).not.toBeNull();
      expect(Number(existingVal?.value)).toBe(20);

      // 2. Change Kano scheme's irrigableAreaHa to 0.0000 -> makes cropping_intensity not_available!
      await testDb
        .update(organisation)
        .set({ irrigableAreaHa: '0.0000' })
        .where(eq(organisation.id, KANO_SCHEME_ID));

      // 3. Re-run compute
      await computeService.runCompute({ year: 2026, quarter: 1 });

      // 4. Stale computed value in indicator_value MUST be deleted!
      const afterVal = await valueRepo.findBySlot(
        intensityInd!.id,
        2026,
        1,
        'scheme',
        KANO_STATE_ID,
        KANO_SCHEME_ID,
        {},
      );
      expect(afterVal).toBeNull();

      // 5. compute_result must record status = 'not_available'
      const compRes = await testDb
        .select()
        .from(computeResult)
        .where(
          and(
            eq(computeResult.indicatorId, intensityInd!.id),
            eq(computeResult.periodYear, 2026),
            eq(computeResult.periodQuarter, 1),
            eq(computeResult.scopeOrgId, KANO_SCHEME_ID),
          ),
        )
        .limit(1);
      expect(compRes[0]?.status).toBe('not_available');

      // Restore Kano irrigable area for subsequent tests
      await testDb
        .update(organisation)
        .set({ irrigableAreaHa: '1000.0000' })
        .where(eq(organisation.id, KANO_SCHEME_ID));
      await computeService.runCompute({ year: 2026, quarter: 1 });
    });
  });

  describe('3. Phase 3 Gate: Full Quarter Matrix, Manual Values, and Scoped Querying', () => {
    it('gate test: manual values entered + approved, computed produced, matrix matches exact hand calculation', async () => {
      // 1. Enter manual value for indicator 5: Dams meeting safety standards (manual, target 8)
      const [damSafetyInd] = await testDb
        .select()
        .from(indicator)
        .where(eq(indicator.code, '5'))
        .limit(1);

      // Create target for 2026
      await testDb.insert(indicatorTarget).values({
        id: crypto.randomUUID(),
        indicatorId: damSafetyInd!.id,
        year: 2026,
        scopeType: 'scheme',
        scopeStateId: KANO_STATE_ID,
        scopeOrgId: KANO_SCHEME_ID,
        value: '8.0000',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Create and approve manual indicator_value = 6
      const manualVal = await valueRepo.create({
        indicatorId: damSafetyInd!.id,
        periodYear: 2026,
        periodQuarter: 1,
        scopeType: 'scheme',
        scopeStateId: KANO_STATE_ID,
        scopeOrgId: KANO_SCHEME_ID,
        disaggregation: {},
        value: '6.0000',
        source: 'manual',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
      });
      expect(manualVal.id).toBeDefined();

      // 2. Refresh materialized view
      await matrixRepo.refreshMatrix();

      // 3. Query GET /me/matrix as National Admin
      const res = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${KANO_SCHEME_ID}`,
        headers: { authorization: `Bearer ${nationalAdminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThan(0);

      // 4. Verify Manual Indicator 5 in matrix
      const rowInd5 = data.items.find(
        (i: IndicatorMatrixRow) =>
          i.indicatorCode === '5' && Object.keys(i.disaggregation).length === 0,
      );
      expect(rowInd5).toBeDefined();
      expect(Number(rowInd5.value)).toBe(6);
      expect(Number(rowInd5.target)).toBe(8);
      expect(Number(rowInd5.endTarget)).toBe(8);
      // % of end target = (6 / 8) * 100 = 75.00%
      expect(rowInd5.pctOfEndTarget).toBe('75.00');

      // 5. Verify Computed Indicator 14b (Rice Yield)
      const rowRice = data.items.find((i: IndicatorMatrixRow) => i.indicatorCode === '14b');
      expect(rowRice).toBeDefined();
      expect(Number(rowRice.value)).toBe(2.5);
      // endTarget is NULL for 14b -> pctOfEndTarget MUST be null
      expect(rowRice.pctOfEndTarget).toBeNull();

      // 6. Verify Computed Indicator 16 (Scorecards Published, endTarget = 4)
      const rowScorecard = data.items.find((i: IndicatorMatrixRow) => i.indicatorCode === '16');
      expect(rowScorecard).toBeDefined();
      expect(Number(rowScorecard.value)).toBe(1);
      expect(Number(rowScorecard.endTarget)).toBe(4);
      // % of end target = (1 / 4) * 100 = 25.00%
      expect(rowScorecard.pctOfEndTarget).toBe('25.00');
    });

    it('enforces scope on GET /me/matrix: state and scheme officers can read only within their scope', async () => {
      // 1. Kano State Officer querying Kano scheme -> 200
      const kanoStateOnKano = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${KANO_SCHEME_ID}`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
      });
      expect(kanoStateOnKano.statusCode).toBe(200);

      // 2. Kano State Officer querying Lagos scheme -> 404 (out-of-scope reads return 404)
      const kanoStateOnLagos = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${LAGOS_SCHEME_ID}`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
      });
      expect(kanoStateOnLagos.statusCode).toBe(404);

      // 3. Kano Scheme Officer querying Lagos scheme -> 404
      const kanoSchemeOnLagos = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${LAGOS_SCHEME_ID}`,
        headers: { authorization: `Bearer ${kanoSchemeOfficerToken}` },
      });
      expect(kanoSchemeOnLagos.statusCode).toBe(404);

      // 4. Lagos Scheme Officer querying Lagos scheme -> 200
      const lagosSchemeOnLagos = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${LAGOS_SCHEME_ID}`,
        headers: { authorization: `Bearer ${lagosSchemeOfficerToken}` },
      });
      expect(lagosSchemeOnLagos.statusCode).toBe(200);

      // 5. Lagos Scheme Officer querying Kano scheme -> 404
      const lagosSchemeOnKano = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1&scopeType=scheme&scopeId=${KANO_SCHEME_ID}`,
        headers: { authorization: `Bearer ${lagosSchemeOfficerToken}` },
      });
      expect(lagosSchemeOnKano.statusCode).toBe(404);

      // 6. Missing permission or unauthenticated -> 401 / 403
      const unauth = await app.inject({
        method: 'GET',
        url: `/me/matrix?year=2026&quarter=1`,
      });
      expect(unauth.statusCode).toBe(401);
    });

    it('admin compute trigger POST /me/compute enqueues job and returns 202', async () => {
      // Missing permission -> 403
      const forbiddenRes = await app.inject({
        method: 'POST',
        url: '/me/compute',
        headers: { authorization: `Bearer ${kanoSchemeOfficerToken}` },
        payload: { year: 2026, quarter: 1 },
      });
      expect(forbiddenRes.statusCode).toBe(403);

      // Admin with ME_INDICATOR_MANAGE -> 202 Accepted
      const adminRes = await app.inject({
        method: 'POST',
        url: '/me/compute',
        headers: { authorization: `Bearer ${nationalAdminToken}` },
        payload: { year: 2026, quarter: 1 },
      });
      expect(adminRes.statusCode).toBe(202);
      expect(adminRes.json().message).toContain('enqueued');
    });
  });
});
