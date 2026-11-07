import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import path from 'node:path';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import {
  postgres,
  drizzle,
  migrate,
  appUser,
  role,
  rolePermission,
  assignment,
  state,
  lga,
  ward,
  organisation,
  organisationState,
  basin,
  dam,
  lookupType,
  lookupValue,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './platform/filters';
import { initAuditWriter } from './platform/audit/audit-writer';

describe('IDMIS 2.0 Launch Readiness Smoke Test Suite (BE-5.5)', () => {
  const TEST_DB_NAME = `idmis_smoke_e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;
  let app: NestFastifyApplication;

  // Test Entities
  const SYSTEM_USER_ID = '00000000-0000-7000-8000-000000000001';
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const KANO_LGA_ID = '018f3a5e-2500-7000-8000-000000000001';
  const KANO_WARD_ID = '018f3a5e-2600-7000-8000-000000000001';
  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const HJ_RBDA_ID = '018f3a5e-4500-7000-8000-000000000001';
  const HJB_BASIN_ID = '018f3a5e-4600-7000-8000-000000000001';
  const TIGA_DAM_ID = '018f3a5e-5000-7000-8000-000000000001';

  let goodRatingId: string;
  let hazardHighId: string;

  const USER_PASSWORD = 'SmokePassword123!';
  let userPasswordHash: string;
  let smokeAdminId: string;
  const SMOKE_ADMIN_EMAIL = `smoke.admin.${Date.now()}@idmis.gov.ng`;
  let accessToken: string;
  let registeredFarmerId: string;
  let createdInspectionId: string;
  let reportJobId: string;

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);
    process.env.DATABASE_URL = testDbUrl;

    // 2. Run Database Migrations
    const migrationsFolder = path.resolve(__dirname, '../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    // 3. Bootstrap Nest Fastify App
    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userPasswordHash = await argon2.hash(USER_PASSWORD);

    // 4. Seed Essential Data
    // System User
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.gov.ng',
      fullName: 'System User',
      passwordHash: userPasswordHash,
      isActive: true,
    });

    // State, LGA, Ward
    await testDb.insert(state).values({
      id: KANO_STATE_ID,
      code: 'KN',
      name: 'Kano',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(lga).values({
      id: KANO_LGA_ID,
      stateId: KANO_STATE_ID,
      code: 'KN-KURA',
      name: 'Kura',
    });

    await testDb.insert(ward).values({
      id: KANO_WARD_ID,
      lgaId: KANO_LGA_ID,
      code: 'KN-KURA-01',
      name: 'Kura Central',
    });

    // Scheme Organisation
    await testDb.insert(organisation).values({
      id: KANO_SCHEME_ID,
      type: 'scheme',
      code: 'KRIS',
      name: 'Kano River Irrigation Scheme',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(organisationState).values({
      organisationId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
    });

    // RBDA Organisation & Basin
    await testDb.insert(organisation).values({
      id: HJ_RBDA_ID,
      type: 'rbda',
      code: 'HJRBDA',
      name: 'Hadejia-Jamaare RBDA',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(basin).values({
      id: HJB_BASIN_ID,
      code: 'HJB-01',
      name: 'Hadejia Basin',
      rbdaId: HJ_RBDA_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Dam
    await testDb.insert(dam).values({
      id: TIGA_DAM_ID,
      code: 'DAM-TIGA',
      name: 'Tiga Dam',
      basinId: HJB_BASIN_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Lookups: component_rating & hazard_class
    const conditionRatingTypeId = crypto.randomUUID();
    goodRatingId = crypto.randomUUID();
    await testDb.insert(lookupType).values({
      id: conditionRatingTypeId,
      key: 'component_rating',
      name: 'Component Condition Rating',
      module: 'blis',
      isSystem: true,
    });
    await testDb.insert(lookupValue).values({
      id: goodRatingId,
      lookupTypeId: conditionRatingTypeId,
      code: 'good',
      label: 'Good Condition',
      sortOrder: 1,
    });

    const hazardClassTypeId = crypto.randomUUID();
    hazardHighId = crypto.randomUUID();
    await testDb.insert(lookupType).values({
      id: hazardClassTypeId,
      key: 'hazard_class',
      name: 'Hazard Class',
      module: 'blis',
      isSystem: true,
    });
    await testDb.insert(lookupValue).values({
      id: hazardHighId,
      lookupTypeId: hazardClassTypeId,
      code: 'high',
      label: 'High Hazard',
      sortOrder: 1,
    });

    // 5. Seed Super Admin Role & User with all permissions
    const smokeAdminRole = crypto.randomUUID();
    await testDb.insert(role).values({
      id: smokeAdminRole,
      key: 'smoke_admin_role',
      name: 'Smoke Admin Role',
    });

    // Assign all required permissions for the smoke flows
    const allPerms = [
      permissions.DASHBOARD_VIEW,
      permissions.SLIS_FARMER_CREATE,
      permissions.SLIS_FARMER_READ,
      permissions.BLIS_INSPECTION_RECORD,
      permissions.REPORT_GENERATE,
    ];

    for (const perm of allPerms) {
      await testDb.insert(rolePermission).values({
        roleId: smokeAdminRole,
        permission: perm,
      });
    }

    smokeAdminId = crypto.randomUUID();
    await testDb.insert(appUser).values({
      id: smokeAdminId,
      email: SMOKE_ADMIN_EMAIL,
      fullName: 'Smoke Admin User',
      passwordHash: userPasswordHash,
      isActive: true,
    });

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: smokeAdminId,
      roleId: smokeAdminRole,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
  });

  afterAll(async () => {
    try {
      await app?.close();
      await testClient?.end();
      await adminClient?.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient?.end();
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. Deep Health Check (GET /health)', () => {
    it('returns 200 OK with all 5 subsystems reporting "up"', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.details).toBeDefined();
      expect(body.details.database).toBe('up');
      expect(body.details.redis).toBe('up');
      expect(body.details.storage).toBe('up');
      expect(body.details.clamd).toBe('up');
      expect(body.details.migrations).toBe('up');
    });
  });

  describe('2. Authentication & Session Flow (POST /auth/sign-in, GET /auth/me)', () => {
    it('signs in with valid credentials, returns JWT accessToken and user object', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: SMOKE_ADMIN_EMAIL,
          password: USER_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe('string');
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(SMOKE_ADMIN_EMAIL);

      accessToken = body.accessToken;
    });

    it('validates authentication via GET /auth/me using Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBe(SMOKE_ADMIN_EMAIL);
      expect(body.roles).toBeDefined();
    });
  });

  describe('3. Executive & Operational Dashboards (GET /dashboards/*)', () => {
    it('fetches programme-level dashboard with headline KPIs and children states', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/dashboards/programme',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.farmers).toBeDefined();
      expect(body.area).toBeDefined();
      expect(body.area.byServiceType).toBeDefined();
      expect(body.feeRecovery).toBeDefined();
      expect(body.indicatorProgress).toBeDefined();
      expect(body.damStatus).toBeDefined();
      expect(body.lastRefreshedAt).toBeDefined();
      expect(Array.isArray(body.children)).toBe(true);
    });

    it('fetches state-level dashboard for Kano state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${KANO_STATE_ID}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.farmers).toBeDefined();
      expect(body.damStatus).toBeDefined();
    });

    it('fetches scheme-level dashboard for Kano River scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/scheme/${KANO_SCHEME_ID}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.farmers).toBeDefined();
      expect(body.feeRecovery).toBeDefined();
    });
  });

  describe('4. SLIS Farmer Registration (POST /slis/farmers, GET /slis/farmers/:id)', () => {
    it('registers a new farmer with demographic and location attributes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KANO_WARD_ID,
          farmerCode: 'KRIS-FRM-SMOKE-01',
          firstName: 'Ibrahim',
          lastName: 'Musa',
          gender: 'male',
          birthYear: 1985,
          phone: '+2348011112222',
          village: 'Chiromawa',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.firstName).toBe('Ibrahim');
      expect(body.lastName).toBe('Musa');
      expect(body.farmerCode).toBe('KRIS-FRM-SMOKE-01');

      registeredFarmerId = body.id;
    });

    it('retrieves the registered farmer by ID with derived state location', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/farmers/${registeredFarmerId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(registeredFarmerId);
      expect(body.firstName).toBe('Ibrahim');
      expect(body.stateId).toBe(KANO_STATE_ID);
    });
  });

  describe('5. BLIS Dam Safety Inspection (POST /blis/dam-inspections, GET /blis/dam-inspections/:id)', () => {
    it('submits a comprehensive dam safety inspection record', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-11-01',
          nextDueOn: '2027-11-01',
          hazardClassId: hazardHighId,
          staffOnSite: 4,
          components: [
            { component: 'dam_body', ratingId: goodRatingId, notes: 'Solid condition' },
            { component: 'spillway_1', ratingId: goodRatingId, notes: 'Clear flow' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.damId).toBe(TIGA_DAM_ID);
      expect(body.status).toBe('submitted');

      createdInspectionId = body.id;
    });

    it('retrieves the submitted dam inspection record by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/dam-inspections/${createdInspectionId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(createdInspectionId);
      expect(body.damId).toBe(TIGA_DAM_ID);
      expect(body.status).toBe('submitted');
    });
  });

  describe('6. PDF Report Generation Flow (POST /reports, GET /reports/:id)', () => {
    it('initiates asynchronous generation of an official PDF report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          type: 'scheme_report',
          params: {
            schemeId: KANO_SCHEME_ID,
            year: 2026,
          },
        },
      });

      expect(res.statusCode).toBe(202);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.status).toBe('queued');

      reportJobId = body.id;
    });

    it('tracks report job status via GET /reports/:id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/reports/${reportJobId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(reportJobId);
      expect(body.type).toBe('scheme_report');
      expect(['queued', 'processing', 'completed']).toContain(body.status);
    });
  });
});
