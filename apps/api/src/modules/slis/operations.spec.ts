import 'reflect-metadata';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import {
  appUser,
  assignment,
  auditLog,
  farmer,
  lga,
  lookupType,
  lookupValue,
  organisation,
  organisationState,
  outboxEvent,
  plot,
  role,
  rolePermission,
  season,
  session,
  state,
  ward,
  wua,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
  eq,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';

describe('SLIS Operations (BE-2.4)', () => {
  const TEST_DB_NAME = `idmis_slis_ops_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  let app: NestFastifyApplication;
  let tokenService: TokenService;

  // UUIDs
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const KADUNA_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KADUNA_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const KADUNA_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KANO_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000003';
  const KADUNA_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';
  const KADUNA_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000004';

  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const KADUNA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';

  const SCHEME_DATA_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000001';

  let kanoOfficerToken: string;
  let kadunaOfficerToken: string;

  let testKanoFarmerId: string;
  let testKanoPlotId: string;
  let testKadunaPlotId: string;
  let testKanoWuaId: string;
  let testKanoSeasonId: string;
  let testCropTypeId: string;
  const testStationId = '018f3a5e-9000-7000-8000-000000000001';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: ['error', 'warn'],
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);

    // 1. Seed Users
    const passHash = await argon2.hash('Secret1234!');
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System User',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano.officer@example.com',
        fullName: 'Kano Scheme Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_OFFICER_ID,
        email: 'kaduna.officer@example.com',
        fullName: 'Kaduna Scheme Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 2. Geography
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KAN',
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_STATE_ID,
        code: 'KAD',
        name: 'Kaduna',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(lga).values([
      {
        id: KANO_LGA_ID,
        stateId: KANO_STATE_ID,
        code: 'KAN-KRA',
        name: 'Kura',
      },
      {
        id: KADUNA_LGA_ID,
        stateId: KADUNA_STATE_ID,
        code: 'KAD-CHIK',
        name: 'Chikun',
      },
    ]);

    await testDb.insert(ward).values([
      {
        id: KANO_WARD_ID,
        lgaId: KANO_LGA_ID,
        code: 'KAN-W1',
        name: 'Kura Central',
      },
      {
        id: KADUNA_WARD_ID,
        lgaId: KADUNA_LGA_ID,
        code: 'KAD-W1',
        name: 'Chikun South',
      },
    ]);

    // 3. Organisations (Schemes & Sectors)
    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        type: 'scheme',
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_ID,
        parentId: KANO_SCHEME_ID,
        type: 'sector',
        code: 'KRIS-SEC-A',
        name: 'Kano Sector A',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_SCHEME_ID,
        type: 'scheme',
        code: 'HJIS',
        name: 'Hadejia-Jamaare Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_SECTOR_ID,
        parentId: KADUNA_SCHEME_ID,
        type: 'sector',
        code: 'HJIS-SEC-1',
        name: 'Kaduna Sector 1',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: KANO_SECTOR_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_SCHEME_ID, stateId: KADUNA_STATE_ID },
      { organisationId: KADUNA_SECTOR_ID, stateId: KADUNA_STATE_ID },
    ]);

    // 4. Roles & Permissions
    await testDb.insert(role).values({
      id: SCHEME_DATA_OFFICER_ROLE_ID,
      key: 'scheme_data_officer',
      name: 'Scheme Data Officer',
      description: 'Manages operations, plots, water, crops, trainings, stream flows',
      isSystem: true,
    });

    await testDb.insert(rolePermission).values([
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_WATER_REQUEST_READ },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_WATER_REQUEST_CREATE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_WATER_REQUEST_DECIDE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_CROP_MANAGE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_TRAINING_MANAGE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_STREAM_FLOW_RECORD },
    ]);

    // 5. Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        roleId: SCHEME_DATA_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KADUNA_OFFICER_ID,
        roleId: SCHEME_DATA_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KADUNA_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Session tokens
    const sidKano = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKano,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kanoOfficerToken = (await tokenService.createAccessToken(KANO_OFFICER_ID, sidKano)).accessToken;

    const sidKaduna = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKaduna,
      familyId: crypto.randomUUID(),
      userId: KADUNA_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kadunaOfficerToken = (await tokenService.createAccessToken(KADUNA_OFFICER_ID, sidKaduna))
      .accessToken;

    // 6. Lookups & Season
    const lookupTypeId = crypto.randomUUID();
    await testDb.insert(lookupType).values({
      id: lookupTypeId,
      key: 'crop_type',
      name: 'Crop Type',
      module: 'slis',
      isSystem: true,
    });

    testCropTypeId = crypto.randomUUID();
    await testDb.insert(lookupValue).values({
      id: testCropTypeId,
      lookupTypeId: lookupTypeId,
      code: 'rice',
      label: 'Rice',
      sortOrder: 1,
      isActive: true,
    });

    testKanoSeasonId = crypto.randomUUID();
    await testDb.insert(season).values({
      id: testKanoSeasonId,
      schemeId: KANO_SCHEME_ID,
      name: '2026 Dry Season',
      startsOn: '2026-01-01',
      endsOn: '2026-06-30',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 7. WUA
    testKanoWuaId = crypto.randomUUID();
    await testDb.insert(wua).values({
      id: testKanoWuaId,
      level: 'sector',
      organisationId: KANO_SCHEME_ID,
      name: 'Kano Sector A WUA',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 8. Farmer & Plots
    testKanoFarmerId = crypto.randomUUID();
    await testDb.insert(farmer).values({
      id: testKanoFarmerId,
      schemeId: KANO_SCHEME_ID,
      sectorId: KANO_SECTOR_ID,
      stateId: KANO_STATE_ID,
      farmerCode: 'KAN-FARM-001',
      firstName: 'Ibrahim',
      lastName: 'Musa',
      gender: 'male',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    testKanoPlotId = crypto.randomUUID();
    await testDb.insert(plot).values({
      id: testKanoPlotId,
      schemeId: KANO_SCHEME_ID,
      sectorId: KANO_SECTOR_ID,
      stateId: KANO_STATE_ID,
      plotCode: 'PLT-KRIS-001',
      areaHa: '2.5000',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    testKadunaPlotId = crypto.randomUUID();
    await testDb.insert(plot).values({
      id: testKadunaPlotId,
      schemeId: KADUNA_SCHEME_ID,
      sectorId: KADUNA_SECTOR_ID,
      stateId: KADUNA_STATE_ID,
      plotCode: 'PLT-HJIS-001',
      areaHa: '3.0000',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end();
    }
  });

  describe('Water Requests', () => {
    let createdIndividualRequestId: string;

    it('creates an individual water request requiring farmerId without wuaId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/water-requests',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          level: 'individual',
          farmerId: testKanoFarmerId,
          seasonId: testKanoSeasonId,
          volumeM3: '250.50',
          periodFromOn: '2026-03-01',
          periodToOn: '2026-03-15',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.level).toBe('individual');
      expect(body.farmerId).toBe(testKanoFarmerId);
      expect(body.wuaId).toBeNull();
      expect(body.decision).toBe('pending');
      expect(body.status).toBe('draft');
      expect(body.volumeM3).toBe('250.50');

      createdIndividualRequestId = body.id;

      // Verify outbox event
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, createdIndividualRequestId));
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('slis.water_request.created');

      // Verify audit log
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, createdIndividualRequestId));
      expect(audits.length).toBeGreaterThanOrEqual(1);
      expect(audits[0]?.entityType).toBe('slis.water_request');
    });

    it('rejects an individual water request missing farmerId or containing wuaId', async () => {
      const resMissingFarmer = await app.inject({
        method: 'POST',
        url: '/slis/water-requests',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          level: 'individual',
          wuaId: testKanoWuaId,
        },
      });
      expect([400, 422]).toContain(resMissingFarmer.statusCode);

      const resBoth = await app.inject({
        method: 'POST',
        url: '/slis/water-requests',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          level: 'individual',
          farmerId: testKanoFarmerId,
          wuaId: testKanoWuaId,
        },
      });
      expect([400, 422]).toContain(resBoth.statusCode);
    });

    it('creates a sector-level water request requiring wuaId without farmerId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/water-requests',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          level: 'sector',
          wuaId: testKanoWuaId,
          seasonId: testKanoSeasonId,
          volumeM3: '1500.00',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.level).toBe('sector');
      expect(body.wuaId).toBe(testKanoWuaId);
      expect(body.farmerId).toBeNull();
    });

    it('decides a water request and writes outbox event slis.water_request.decided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/water-requests/${createdIndividualRequestId}/decide`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
        },
        payload: {
          decision: 'approved',
          comment: 'Approved for irrigation cycle 1',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.decision).toBe('approved');
      expect(body.version).toBe(2);

      // Verify decide outbox event
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, createdIndividualRequestId));
      const decideEvent = events.find((e) => e.eventType === 'slis.water_request.decided');
      expect(decideEvent).toBeDefined();
    });

    it('returns 409 Conflict when deciding with a stale version', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/water-requests/${createdIndividualRequestId}/decide`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1', // Stale version (current is 2)
        },
        payload: {
          decision: 'rejected',
          comment: 'Late attempt',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('enforces scope isolation: Kaduna officer cannot see Kano water requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/water-requests/${createdIndividualRequestId}`,
        headers: { authorization: `Bearer ${kadunaOfficerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Crop Production', () => {
    let createdCropId: string;

    it('records crop production on a plot in scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/crops',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          plotId: testKanoPlotId,
          seasonId: testKanoSeasonId,
          cropTypeId: testCropTypeId,
          areaHa: '2.5000',
          yieldT: '12.400',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.plotId).toBe(testKanoPlotId);
      expect(body.areaHa).toBe('2.5000');
      expect(body.yieldT).toBe('12.400');
      expect(body.status).toBe('draft');

      createdCropId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, createdCropId));
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('slis.crop.recorded');
    });

    it('rejects crop production when plot belongs to a different scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/crops',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          plotId: testKadunaPlotId, // Kaduna plot used in Kano scheme
          seasonId: testKanoSeasonId,
          cropTypeId: testCropTypeId,
          areaHa: '1.0000',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('updates crop production with optimistic concurrency check', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/crops/${createdCropId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
        },
        payload: {
          yieldT: '14.500',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.yieldT).toBe('14.500');
      expect(body.version).toBe(2);
    });

    it('enforces scope isolation on crop production listing', async () => {
      const kanoRes = await app.inject({
        method: 'GET',
        url: '/slis/crops',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(kanoRes.statusCode).toBe(200);
      expect(kanoRes.json().items.some((i: { id: string }) => i.id === createdCropId)).toBe(true);

      const kadunaRes = await app.inject({
        method: 'GET',
        url: '/slis/crops',
        headers: { authorization: `Bearer ${kadunaOfficerToken}` },
      });
      expect(kadunaRes.statusCode).toBe(200);
      expect(kadunaRes.json().items.some((i: { id: string }) => i.id === createdCropId)).toBe(
        false,
      );
    });
  });

  describe('Trainings & Attendance', () => {
    let createdTrainingId: string;

    it('creates a training with tags and heldOn date', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/trainings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          topic: 'Water Scheduling Best Practices',
          tags: ['irrigation', 'water_management'],
          heldOn: '2026-03-10',
          venue: 'Sector A Community Hall',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.topic).toBe('Water Scheduling Best Practices');
      expect(body.tags).toEqual(['irrigation', 'water_management']);
      expect(body.heldOn).toBe('2026-03-10');

      createdTrainingId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, createdTrainingId));
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('slis.training.created');
    });

    it('lists trainings filtered by tag', async () => {
      const resMatch = await app.inject({
        method: 'GET',
        url: '/slis/trainings?tag=irrigation',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resMatch.statusCode).toBe(200);
      expect(resMatch.json().items.length).toBe(1);

      const resNomatch = await app.inject({
        method: 'GET',
        url: '/slis/trainings?tag=financials',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resNomatch.statusCode).toBe(200);
      expect(resNomatch.json().items.length).toBe(0);
    });

    it('records attendance for a farmer and enforces one-of attendance constraint', async () => {
      const resFarmer = await app.inject({
        method: 'POST',
        url: `/slis/trainings/${createdTrainingId}/attendance`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          farmerId: testKanoFarmerId,
        },
      });

      expect(resFarmer.statusCode).toBe(201);
      const body = resFarmer.json();
      expect(body.farmerId).toBe(testKanoFarmerId);
      expect(body.staffName).toBeNull();

      // Verify attendance outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, body.id));
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('slis.training.attended');

      // Rejects attendance with BOTH farmerId and staffName
      const resBoth = await app.inject({
        method: 'POST',
        url: `/slis/trainings/${createdTrainingId}/attendance`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          farmerId: testKanoFarmerId,
          staffName: 'Aliyu Staff',
        },
      });
      expect([400, 422]).toContain(resBoth.statusCode);

      // Rejects duplicate farmer attendance in the same training
      const resDuplicate = await app.inject({
        method: 'POST',
        url: `/slis/trainings/${createdTrainingId}/attendance`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          farmerId: testKanoFarmerId,
        },
      });
      expect([400, 409, 500]).toContain(resDuplicate.statusCode);

      // Allows staff attendance
      const resStaff = await app.inject({
        method: 'POST',
        url: `/slis/trainings/${createdTrainingId}/attendance`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          staffName: 'Usman Trainer',
          gender: 'male',
        },
      });
      expect(resStaff.statusCode).toBe(201);
      expect(resStaff.json().staffName).toBe('Usman Trainer');
    });

    it('lists training attendance', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/trainings/${createdTrainingId}/attendance`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBe(2);
    });
  });

  describe('Stream Flow Readings', () => {
    let createdStreamFlowId: string;

    it('records a stream flow reading and writes outbox event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/stream-flows',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          stationId: testStationId,
          readAt: '2026-03-15T08:00:00.000Z',
          value: '45.1250',
          unit: 'm3/s',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.stationId).toBe(testStationId);
      expect(body.value).toBe('45.1250');
      expect(body.unit).toBe('m3/s');

      createdStreamFlowId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, createdStreamFlowId));
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe('slis.stream_flow.recorded');
    });

    it('rejects stream flow reading with an invalid/unknown station id via BLIS stub', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/stream-flows',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          stationId: '00000000-0000-0000-0000-000000000000', // Nil UUID rejected by BLIS stub
          readAt: '2026-03-15T08:00:00.000Z',
          value: '10.0000',
          unit: 'm3/s',
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('enforces scope isolation: Kaduna officer cannot see Kano stream flow readings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/stream-flows/${createdStreamFlowId}`,
        headers: { authorization: `Bearer ${kadunaOfficerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
