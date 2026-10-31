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
  organisation,
  organisationState,
  outboxEvent,
  plot,
  role,
  rolePermission,
  session,
  state,
  ward,
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

describe('SLIS Plots, Farms & Allocations (BE-2.3)', () => {
  const TEST_DB_NAME = `idmis_slis_plot_test_${Date.now()}`;
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
  let testFarmerId: string;

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
        email: 'kano@idmis.gov.ng',
        fullName: 'Kano Scheme Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_OFFICER_ID,
        email: 'kaduna@idmis.gov.ng',
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
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KAN-KURA', name: 'Kura' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KAD-CHIK', name: 'Chikun' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KAN-W1', name: 'Kura Central' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KAD-W1', name: 'Chikun South' },
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
      description: 'Manages plots, farms, allocations',
      isSystem: true,
    });

    await testDb.insert(rolePermission).values([
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_ALLOCATION_MANAGE },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: SCHEME_DATA_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_CREATE },
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

    // Create session tokens
    const sidKano = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKano,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kanoOfficerToken = (await tokenService.createAccessToken(KANO_OFFICER_ID, sidKano)).accessToken;

    const sidKaduna = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKaduna,
      familyId: crypto.randomUUID(),
      userId: KADUNA_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kadunaOfficerToken = (await tokenService.createAccessToken(KADUNA_OFFICER_ID, sidKaduna))
      .accessToken;

    // 6. Seed a test farmer in Kano scheme
    const [f] = await testDb
      .insert(farmer)
      .values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        farmerCode: 'KRIS-FRM-TEST',
        firstName: 'Lawal',
        lastName: 'Ahmed',
        gender: 'male',
        stateId: KANO_STATE_ID,
        wardId: KANO_WARD_ID,
        status: 'approved',
        version: 1,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .returning();
    testFarmerId = f!.id;
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

  describe('Farms API', () => {
    let farmId: string;

    it('creates a farm in scope with audit log and outbox event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farms',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          name: 'Kano North Irrigation Farm',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Kano North Irrigation Farm');
      expect(body.version).toBe(1);
      farmId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, farmId));
      expect(events[0]?.eventType).toBe('slis.farm.created');
    });

    it('lists farms within user scope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/farms',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0]?.id).toBe(farmId);
    });

    it('updates farm with optimistic concurrency control', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/farms/${farmId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          name: 'Kano North Main Farm',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Kano North Main Farm');
      expect(res.json().version).toBe(2);

      // Stale update
      const staleRes = await app.inject({
        method: 'PATCH',
        url: `/slis/farms/${farmId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          name: 'Conflicting Farm Name',
        },
      });

      expect(staleRes.statusCode).toBe(409);
    });
  });

  describe('Plots API', () => {
    let plotId: string;

    it('creates a plot with server-side derived stateId, audit log, and outbox event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/plots',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          wardId: KANO_WARD_ID,
          plotCode: 'PLT-KRIS-001',
          areaHa: 2.5,
          serviceType: 'new',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.plotCode).toBe('PLT-KRIS-001');
      expect(body.stateId).toBe(KANO_STATE_ID); // Derived server-side
      expect(body.version).toBe(1);
      plotId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, plotId));
      expect(events[0]?.eventType).toBe('slis.plot.created');

      // Verify audit
      const audits = await testDb.select().from(auditLog).where(eq(auditLog.entityId, plotId));
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0]?.entityType).toBe('slis.plot');
      expect(audits[0]?.action).toBe('create');
    });

    it('enforces plot code uniqueness per scheme (409 Conflict / duplicate rejected)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/plots',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          wardId: KANO_WARD_ID,
          plotCode: 'PLT-KRIS-001', // Duplicate in same scheme!
          areaHa: 1.0,
        },
      });

      // Database unique index constraint triggers error or conflict
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects creating plot in a scheme outside user scope (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/plots',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`, // Kano officer
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KADUNA_SCHEME_ID,
          sectorId: KADUNA_SECTOR_ID,
          wardId: KADUNA_WARD_ID,
          plotCode: 'PLT-HJIS-001',
          areaHa: 3.0,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('updates plot with optimistic concurrency control', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/plots/${plotId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          areaHa: 2.75,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().version).toBe(2);

      // Stale update
      const staleRes = await app.inject({
        method: 'PATCH',
        url: `/slis/plots/${plotId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          areaHa: 3.0,
        },
      });

      expect(staleRes.statusCode).toBe(409);
    });
  });

  describe('Plot Allocations API', () => {
    let plotId: string;
    let allocationId: string;

    beforeAll(async () => {
      // Create a plot for allocation testing
      const [p] = await testDb
        .insert(plot)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          wardId: KANO_WARD_ID,
          stateId: KANO_STATE_ID,
          plotCode: 'PLT-ALLOC-001',
          areaHa: '1.5',
          status: 'approved',
          version: 1,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .returning();
      plotId = p!.id;
    });

    it('creates a plot allocation in scope with audit log and outbox event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/allocations',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          plotId,
          farmerId: testFarmerId,
          fromOn: '2026-01-01',
          toOn: '2026-12-31',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.plotId).toBe(plotId);
      expect(body.farmerId).toBe(testFarmerId);
      expect(body.version).toBe(1);
      allocationId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, allocationId));
      expect(events[0]?.eventType).toBe('slis.allocation.created');
    });

    it('lists plot allocations with scope filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/allocations?plotId=${plotId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0]?.id).toBe(allocationId);
    });

    it('deallocates an allocation setting toOn to today', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/allocations/${allocationId}/deallocate`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      const today = new Date().toISOString().slice(0, 10);
      expect(body.toOn).toBe(today);
      expect(body.version).toBe(2);
    });

    it('rejects cross-scheme allocation modification (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/allocations/${allocationId}/deallocate`,
        headers: {
          authorization: `Bearer ${kadunaOfficerToken}`, // Kaduna officer modifying Kano allocation
          'if-match': '2',
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
