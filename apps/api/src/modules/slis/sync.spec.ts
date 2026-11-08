import 'reflect-metadata';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import {
  appUser,
  assignment,
  changeLog,
  device,
  farmer,
  lga,
  organisation,
  organisationState,
  plot,
  role,
  rolePermission,
  session,
  state,
  syncConflict,
  syncOp,
  syncQuarantine,
  ward,
  waterRequest,
  season,
  feeBilling,
  feeCollection,
  basin,
  dam,
  damSafetyInspection,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
  eq,
  and,
  inArray,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { AuthzService } from '../../platform/auth';
import { RedisService } from '../../platform/redis/redis.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { SyncRepository } from './repositories/sync.repository';

describe('SLIS Sync Server Engine (BE-2.6)', () => {
  const TEST_DB_NAME = `idmis_slis_sync_test_${Date.now()}`;
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
  const LAGOS_STATE_ID = '018f3a5e-2000-7000-8000-000000000003';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KADUNA_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const LAGOS_LGA_ID = '018f3a5e-5000-7000-8000-000000000003';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const KADUNA_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';
  const LAGOS_WARD_ID = '018f3a5e-6000-7000-8000-000000000003';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KANO_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000003';
  const KADUNA_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';
  const LAGOS_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000004';

  const FIELD_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000010';
  const SCHEME_DATA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000020';
  const KANO_SLIS_ADMIN_ID = '018f3a5e-1000-7000-8000-000000000030';

  const ROLE_FIELD_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000010';
  const ROLE_SCHEME_DATA_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000020';
  const ROLE_SLIS_ADMIN_ID = '018f3a5e-3000-7000-8000-000000000030';

  let fieldOfficerToken: string;
  let schemeDataOfficerToken: string;
  let kanoSlisAdminToken: string;
  let testFarmerId: string;
  let testSeasonId: string;
  let testBillingId: string;
  let testBasinId: string;
  let testDamId: string;
  const TEST_RBDA_ID = '018f3a5e-4000-7000-8000-000000000099';

  const validDeviceId = '018f3a5e-8000-7000-8000-000000000001';
  const expiredDeviceId = '018f3a5e-8000-7000-8000-000000000002';

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

    // 1. Users
    const passwordHash = await argon2.hash('Password123!', { type: argon2.argon2id });
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        passwordHash,
        fullName: 'System Daemon',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: FIELD_OFFICER_ID,
        email: 'fo-kano@idmis.gov.ng',
        passwordHash,
        fullName: 'Aliyu Field Officer',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: SCHEME_DATA_OFFICER_ID,
        email: 'sdo-kano@idmis.gov.ng',
        passwordHash,
        fullName: 'Bello Scheme Officer',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SLIS_ADMIN_ID,
        email: 'slis-admin-kano@idmis.gov.ng',
        passwordHash,
        fullName: 'Kano SLIS Admin',
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 2. Geography
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_STATE_ID,
        code: 'KD',
        name: 'Kaduna',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_ID,
        code: 'LA',
        name: 'Lagos',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(lga).values([
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KN-KMC', name: 'Kano Municipal' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KD-KDN', name: 'Kaduna North' },
      { id: LAGOS_LGA_ID, stateId: LAGOS_STATE_ID, code: 'LA-IKE', name: 'Ikeja' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KN-WARD-1', name: 'Kano Central Ward' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KD-WARD-1', name: 'Kaduna Central Ward' },
      { id: LAGOS_WARD_ID, lgaId: LAGOS_LGA_ID, code: 'LA-WARD-1', name: 'Ikeja Ward' },
    ]);

    // 3. Organisations
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
        code: 'KRIS-SEC-1',
        name: 'Sector 1 South',
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
        id: LAGOS_SCHEME_ID,
        type: 'scheme',
        code: 'LAG-SCH',
        name: 'Lagos Urban Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: TEST_RBDA_ID,
        type: 'rbda',
        code: 'HJRBDA',
        name: 'Hadejia-Jamaare RBDA',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: KANO_SECTOR_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_SCHEME_ID, stateId: KADUNA_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // 4. Roles & Permissions
    await testDb.insert(role).values([
      {
        id: ROLE_FIELD_OFFICER_ID,
        key: 'field_officer',
        name: 'Field Officer',
        description: 'Collects and submits field data',
        isSystem: true,
      },
      {
        id: ROLE_SCHEME_DATA_OFFICER_ID,
        key: 'scheme_data_officer',
        name: 'Scheme Data Officer',
        description: 'Reviews, approves, resolves conflicts',
        isSystem: true,
      },
      {
        id: ROLE_SLIS_ADMIN_ID,
        key: 'slis_admin',
        name: 'SLIS Administrator',
        description: 'Module administrator for SLIS',
        isSystem: true,
      },
    ]);

    await testDb.insert(rolePermission).values([
      // Field officer: sync push/pull, farmer, plot, water request
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_SYNC_PUSH },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_SYNC_PULL },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_CREATE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_READ },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_REVIEW_SUBMIT },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FEE_RECORD },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.BLIS_INSPECTION_RECORD },

      // Scheme data officer: all above + conflict resolve + review approval
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_PUSH },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_PULL },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_CONFLICT_RESOLVE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_REVIEW_APPROVE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_CREATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_READ },

      // SLIS admin: conflict resolve + full read/write
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_SYNC_PUSH },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_SYNC_PULL },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_SYNC_CONFLICT_RESOLVE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_REVIEW_APPROVE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_WATER_REQUEST_CREATE },
      { roleId: ROLE_SLIS_ADMIN_ID, permission: permissions.SLIS_WATER_REQUEST_READ },
    ]);

    // 5. Assignments (Scoped to Kano Scheme & State)
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        roleId: ROLE_FIELD_OFFICER_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: TEST_RBDA_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        roleId: ROLE_FIELD_OFFICER_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        roleId: ROLE_FIELD_OFFICER_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: SCHEME_DATA_OFFICER_ID,
        roleId: ROLE_SCHEME_DATA_OFFICER_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: SCHEME_DATA_OFFICER_ID,
        roleId: ROLE_SCHEME_DATA_OFFICER_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_SLIS_ADMIN_ID,
        roleId: ROLE_SLIS_ADMIN_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_SLIS_ADMIN_ID,
        roleId: ROLE_SLIS_ADMIN_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 6. Devices
    const now = new Date();
    const grantValid = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const grantExpired = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    await testDb.insert(device).values([
      {
        id: validDeviceId,
        installationId: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        label: "Aliyu's Samsung Tab Active",
        platform: 'android',
        offlineGrantUntil: grantValid,
      },
      {
        id: expiredDeviceId,
        installationId: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        label: 'Expired Tablet',
        platform: 'android',
        offlineGrantUntil: grantExpired,
      },
    ]);

    testSeasonId = crypto.randomUUID();
    await testDb.insert(season).values({
      id: testSeasonId,
      schemeId: KANO_SCHEME_ID,
      name: '2026 Dry Season',
      startsOn: '2026-01-01',
      endsOn: '2026-06-30',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    testBasinId = crypto.randomUUID();
    testDamId = crypto.randomUUID();
    await testDb.insert(basin).values({
      id: testBasinId,
      rbdaId: TEST_RBDA_ID,
      name: 'Hadejia-Jamaare Basin',
      code: 'HJB-SYNC-01',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    await testDb.insert(dam).values({
      id: testDamId,
      basinId: testBasinId,
      name: 'Tiga Dam Sync Test',
      code: 'DAM-TIGA-SYNC',
      lgaId: KANO_LGA_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 7. Sessions & JWT tokens
    const sid1 = crypto.randomUUID();
    const sid2 = crypto.randomUUID();
    const sid3 = crypto.randomUUID();
    await testDb.insert(session).values([
      {
        id: sid1,
        familyId: crypto.randomUUID(),
        userId: FIELD_OFFICER_ID,
        refreshTokenHash: crypto.randomUUID(),
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: sid2,
        familyId: crypto.randomUUID(),
        userId: SCHEME_DATA_OFFICER_ID,
        refreshTokenHash: crypto.randomUUID(),
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: sid3,
        familyId: crypto.randomUUID(),
        userId: KANO_SLIS_ADMIN_ID,
        refreshTokenHash: crypto.randomUUID(),
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    fieldOfficerToken = (await tokenService.createAccessToken(FIELD_OFFICER_ID, sid1)).accessToken;
    schemeDataOfficerToken = (await tokenService.createAccessToken(SCHEME_DATA_OFFICER_ID, sid2))
      .accessToken;
    kanoSlisAdminToken = (await tokenService.createAccessToken(KANO_SLIS_ADMIN_ID, sid3))
      .accessToken;
  }, 60000);

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

  describe('Device Registration', () => {
    it('registers or updates device and returns offline grant', async () => {
      const installationId = crypto.randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/device/register',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          installationId,
          label: 'Field Kit 4',
          platform: 'android',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.installationId).toBe(installationId);
      expect(body.userId).toBe(FIELD_OFFICER_ID);
      expect(body.offlineGrantUntil).toBeDefined();

      const [stored] = await testDb.select().from(device).where(eq(device.id, body.id));
      expect(stored).toBeDefined();
      expect(stored?.label).toBe('Field Kit 4');
    });

    it('rejects push and pull when device does not belong to caller with 403 Forbidden', async () => {
      // Scheme Data Officer calls push with validDeviceId owned by Field Officer
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: crypto.randomUUID(),
              entity: 'farmer',
              action: 'create',
              recordId: crypto.randomUUID(),
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FORBIDDEN-001',
                wardId: KANO_WARD_ID,
                firstName: 'Hassan',
                lastName: 'Lawan',
                gender: 'male',
              },
            },
          ],
        },
      });
      expect(pushRes.statusCode).toBe(403);

      // Scheme Data Officer calls pull with validDeviceId owned by Field Officer
      const pullRes = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${schemeDataOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });
      expect(pullRes.statusCode).toBe(403);
    });
  });

  describe('Sync Push & Idempotency', () => {
    const op1Id = crypto.randomUUID();
    const op2Id = crypto.randomUUID();
    const testPlotId = crypto.randomUUID();

    it('applies pushed operations through domain services with scope & permission validation', async () => {
      testFarmerId = crypto.randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: op1Id,
              entity: 'farmer',
              action: 'create',
              recordId: testFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-KN-001',
                wardId: KANO_WARD_ID,
                firstName: 'Sani',
                lastName: 'Dikko',
                gender: 'male',
                phone: '08012345678',
              },
            },
            {
              opId: op2Id,
              entity: 'plot',
              action: 'create',
              recordId: testPlotId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                sectorId: KANO_SECTOR_ID,
                plotCode: 'P-KRIS-001',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results).toHaveLength(2);
      expect(body.results[0]?.outcome).toBe('applied');
      expect(body.results[0]?.newVersion).toBe(1);
      expect(body.results[1]?.outcome).toBe('applied');
      expect(body.results[1]?.newVersion).toBe(1);

      // Verify db insertion
      const [f] = await testDb.select().from(farmer).where(eq(farmer.id, testFarmerId));
      expect(f).toBeDefined();
      expect(f?.firstName).toBe('Sani');

      const [p] = await testDb.select().from(plot).where(eq(plot.id, testPlotId));
      expect(p).toBeDefined();
      expect(p?.plotCode).toBe('P-KRIS-001');

      // Verify change_log rows were written
      const clRows = await testDb
        .select()
        .from(changeLog)
        .where(eq(changeLog.recordId, testFarmerId));
      expect(clRows.length).toBeGreaterThan(0);
      expect(clRows[0]?.op).toBe('upsert');
    });

    it('applies fee_collection create and update via sync push with change_log and conflict checks', async () => {
      testBillingId = crypto.randomUUID();
      await testDb.insert(feeBilling).values({
        id: testBillingId,
        schemeId: KANO_SCHEME_ID,
        seasonId: testSeasonId,
        farmerId: testFarmerId,
        amountNgn: '50000.00',
        dueDate: '2026-06-01',
        status: 'billed',
        version: 1,
        createdBy: FIELD_OFFICER_ID,
        updatedBy: FIELD_OFFICER_ID,
      });

      const collectionOpId = crypto.randomUUID();
      const collectionRecordId = crypto.randomUUID();
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: collectionOpId,
              entity: 'fee_collection',
              action: 'create',
              recordId: collectionRecordId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                seasonId: testSeasonId,
                farmerId: testFarmerId,
                billingId: testBillingId,
                amountNgn: '15000.00',
                paidOn: '2026-03-25',
                fieldReceiptRef: 'FIELD-REC-001',
              },
            },
          ],
        },
      });

      expect(pushRes.statusCode).toBe(201);
      const pushBody = pushRes.json();
      expect(pushBody.results[0]?.outcome).toBe('applied');
      expect(pushBody.results[0]?.newVersion).toBe(1);

      // Verify db row
      const [col] = await testDb
        .select()
        .from(feeCollection)
        .where(eq(feeCollection.id, collectionRecordId));
      expect(col).toBeDefined();
      expect(col?.amountNgn).toBe('15000.00');

      // Verify change_log row
      const clRows = await testDb
        .select()
        .from(changeLog)
        .where(eq(changeLog.recordId, collectionRecordId));
      expect(clRows.length).toBeGreaterThan(0);
      expect(clRows[0]?.op).toBe('upsert');

      // Update via sync push
      const updateOpId = crypto.randomUUID();
      const updateRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: updateOpId,
              entity: 'fee_collection',
              action: 'update',
              recordId: collectionRecordId,
              baseVersion: 1,
              data: {
                fieldReceiptRef: 'FIELD-REC-001-MOD',
              },
            },
          ],
        },
      });

      expect(updateRes.statusCode).toBe(201);
      const updateBody = updateRes.json();
      expect(updateBody.results[0]?.outcome).toBe('applied');
      expect(updateBody.results[0]?.newVersion).toBe(2);

      // Stale update triggers conflict
      const staleOpId = crypto.randomUUID();
      const staleRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: staleOpId,
              entity: 'fee_collection',
              action: 'update',
              recordId: collectionRecordId,
              baseVersion: 1, // stale! current is 2
              data: {
                fieldReceiptRef: 'FIELD-REC-STALE',
              },
            },
          ],
        },
      });

      expect(staleRes.statusCode).toBe(201);
      const staleBody = staleRes.json();
      expect(staleBody.results[0]?.outcome).toBe('conflict');
    });

    it('applies dam_inspection create and update via sync push with change_log and conflict checks', async () => {
      const inspectionOpId = crypto.randomUUID();
      const inspectionRecordId = crypto.randomUUID();
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: inspectionOpId,
              entity: 'dam_inspection',
              action: 'create',
              recordId: inspectionRecordId,
              baseVersion: 1,
              data: {
                damId: testDamId,
                inspectedOn: '2026-04-10',
                staffOnSite: 5,
              },
            },
          ],
        },
      });

      expect(pushRes.statusCode).toBe(201);
      const pushBody = pushRes.json();
      expect(pushBody.results[0]?.outcome).toBe('applied');
      expect(pushBody.results[0]?.newVersion).toBe(1);

      // Verify db row
      const [insp] = await testDb
        .select()
        .from(damSafetyInspection)
        .where(eq(damSafetyInspection.id, inspectionRecordId));
      expect(insp).toBeDefined();
      expect(insp?.damId).toBe(testDamId);

      // Verify change_log row
      const clRows = await testDb
        .select()
        .from(changeLog)
        .where(eq(changeLog.recordId, inspectionRecordId));
      expect(clRows.length).toBeGreaterThan(0);
      expect(clRows[0]?.op).toBe('upsert');

      // Update via sync push
      const updateOpId = crypto.randomUUID();
      const updateRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: updateOpId,
              entity: 'dam_inspection',
              action: 'update',
              recordId: inspectionRecordId,
              baseVersion: 1,
              data: {
                staffOnSite: 8,
              },
            },
          ],
        },
      });

      expect(updateRes.statusCode).toBe(201);
      const updateBody = updateRes.json();
      expect(updateBody.results[0]?.outcome).toBe('applied');
      expect(updateBody.results[0]?.newVersion).toBe(2);

      // Stale update triggers conflict
      const staleOpId = crypto.randomUUID();
      const staleRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: staleOpId,
              entity: 'dam_inspection',
              action: 'update',
              recordId: inspectionRecordId,
              baseVersion: 1, // stale! current is 2
              data: {
                staffOnSite: 99,
              },
            },
          ],
        },
      });

      expect(staleRes.statusCode).toBe(201);
      const staleBody = staleRes.json();
      expect(staleBody.results[0]?.outcome).toBe('conflict');
    });

    it('enforces idempotency: identical opId returns cached outcome without re-executing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: op1Id,
              entity: 'farmer',
              action: 'create',
              recordId: testFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-KN-001',
                wardId: KANO_WARD_ID,
                firstName: 'Sani',
                lastName: 'Dikko',
                gender: 'male',
                phone: '08012345678',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results[0]?.opId).toBe(op1Id);
      expect(body.results[0]?.outcome).toBe('applied');
      expect(body.results[0]?.newVersion).toBe(1);

      // Ensure sync_op has only 1 row for op1Id
      const ops = await testDb.select().from(syncOp).where(eq(syncOp.opId, op1Id));
      expect(ops).toHaveLength(1);
    });

    it('rejects operations outside the collector scope with outcome: rejected', async () => {
      const outOfScopeOpId = crypto.randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: outOfScopeOpId,
              entity: 'farmer',
              action: 'create',
              recordId: crypto.randomUUID(),
              baseVersion: 1,
              data: {
                schemeId: KADUNA_SCHEME_ID,
                farmerCode: 'FARM-KD-001',
                wardId: KADUNA_WARD_ID, // Out of scope: Kaduna Ward while officer is scoped to Kano
                firstName: 'Musa',
                lastName: 'Yusuf',
                gender: 'male',
                phone: '08022223333',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results[0]?.outcome).toBe('rejected');
      expect(body.results[0]?.errors).toBeDefined();
      expect(body.results[0]?.errors[0]?.status).toBe(403);
    });

    it('applies concurrent pushes with identical opId atomically without running domain logic twice', async () => {
      const concurrentFarmerId = crypto.randomUUID();
      const concurrentOpId = crypto.randomUUID();
      const payload = {
        deviceId: validDeviceId,
        ops: [
          {
            opId: concurrentOpId,
            entity: 'farmer',
            action: 'create',
            recordId: concurrentFarmerId,
            baseVersion: 1,
            data: {
              schemeId: KANO_SCHEME_ID,
              farmerCode: 'CONC-F-001',
              wardId: KANO_WARD_ID,
              firstName: 'Concurrent',
              lastName: 'Farmer',
              gender: 'male',
              phone: '08033334444',
            },
          },
        ],
      };

      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/slis/sync/push',
          headers: { authorization: `Bearer ${fieldOfficerToken}` },
          payload,
        }),
        app.inject({
          method: 'POST',
          url: '/slis/sync/push',
          headers: { authorization: `Bearer ${fieldOfficerToken}` },
          payload,
        }),
      ]);

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
      expect(res1.json().results[0]?.outcome).toBe('applied');
      expect(res2.json().results[0]?.outcome).toBe('applied');

      // Farmer is created only once
      const farmers = await testDb.select().from(farmer).where(eq(farmer.id, concurrentFarmerId));
      expect(farmers).toHaveLength(1);

      // sync_op has only 1 row
      const ops = await testDb.select().from(syncOp).where(eq(syncOp.opId, concurrentOpId));
      expect(ops).toHaveLength(1);
    });

    it('rolls back both domain write and sync_op when post-domain update throws, allowing successful retry', async () => {
      const crashFarmerId = crypto.randomUUID();
      const crashOpId = crypto.randomUUID();
      const syncRepo = app.get(SyncRepository);

      const spy = vi.spyOn(syncRepo, 'updateSyncOpOutcome');
      spy.mockRejectedValueOnce(
        new Error('Simulated failure during sync_op applied status update'),
      );

      const pushPayload = {
        deviceId: validDeviceId,
        ops: [
          {
            opId: crashOpId,
            entity: 'farmer',
            action: 'create',
            recordId: crashFarmerId,
            baseVersion: 1,
            data: {
              schemeId: KANO_SCHEME_ID,
              farmerCode: 'FARM-CRASH-001',
              wardId: KANO_WARD_ID,
              firstName: 'Crash',
              lastName: 'Tester',
              gender: 'male',
              phone: '08099991111',
            },
          },
        ],
      };

      const resFail = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: pushPayload,
      });

      expect(resFail.statusCode).toBe(500);

      // Verify transaction atomicity: BOTH farmer AND sync_op were rolled back
      const [fBefore] = await testDb.select().from(farmer).where(eq(farmer.id, crashFarmerId));
      expect(fBefore).toBeUndefined();

      const [opBefore] = await testDb.select().from(syncOp).where(eq(syncOp.opId, crashOpId));
      expect(opBefore).toBeUndefined();

      // Retry the exact same push operation now that spy is cleared
      const resRetry = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: pushPayload,
      });

      expect(resRetry.statusCode).toBe(201);
      const bodyRetry = resRetry.json();
      expect(bodyRetry.results[0]?.outcome).toBe('applied');

      const [fAfter] = await testDb.select().from(farmer).where(eq(farmer.id, crashFarmerId));
      expect(fAfter).toBeDefined();
      expect(fAfter?.firstName).toBe('Crash');

      const [opAfter] = await testDb.select().from(syncOp).where(eq(syncOp.opId, crashOpId));
      expect(opAfter).toBeDefined();
      expect(opAfter?.outcome).toBe('applied');
    });

    it('records rejected outcome and stores sync_op when domain validation fails', async () => {
      const rejectFarmerId = crypto.randomUUID();
      const rejectOpId = crypto.randomUUID();

      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: rejectOpId,
              entity: 'farmer',
              action: 'create',
              recordId: rejectFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-REJECT-001',
                wardId: KANO_WARD_ID,
                firstName: 'Invalid',
                lastName: 'Farmer',
                gender: 'invalid_gender', // Domain validation schema constraint violation
                phone: '08099992222',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results[0]?.outcome).toBe('rejected');
      expect(body.results[0]?.errors).toBeDefined();
      expect(body.results[0]?.errors?.length).toBeGreaterThan(0);

      // Farmer was NOT inserted
      const [f] = await testDb.select().from(farmer).where(eq(farmer.id, rejectFarmerId));
      expect(f).toBeUndefined();

      // sync_op row exists with outcome: rejected
      const [op] = await testDb.select().from(syncOp).where(eq(syncOp.opId, rejectOpId));
      expect(op).toBeDefined();
      expect(op?.outcome).toBe('rejected');
    });

    it('batch with one invalid op: that op is rejected, all other ops commit in the same transaction', async () => {
      const validFarmer1Id = crypto.randomUUID();
      const validOp1Id = crypto.randomUUID();
      const invalidFarmer2Id = crypto.randomUUID();
      const invalidOp2Id = crypto.randomUUID();
      const validFarmer3Id = crypto.randomUUID();
      const validOp3Id = crypto.randomUUID();

      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: validOp1Id,
              entity: 'farmer',
              action: 'create',
              recordId: validFarmer1Id,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-BATCH-V1',
                wardId: KANO_WARD_ID,
                firstName: 'ValidFirst',
                lastName: 'Farmer',
                gender: 'male',
                phone: '08091112222',
              },
            },
            {
              opId: invalidOp2Id,
              entity: 'farmer',
              action: 'create',
              recordId: invalidFarmer2Id,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-BATCH-INV',
                wardId: KANO_WARD_ID,
                firstName: 'InvalidSecond',
                lastName: 'Farmer',
                gender: 'unknown_gender', // Schema validation error
                phone: '08092223333',
              },
            },
            {
              opId: validOp3Id,
              entity: 'farmer',
              action: 'create',
              recordId: validFarmer3Id,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-BATCH-V3',
                wardId: KANO_WARD_ID,
                firstName: 'ValidThird',
                lastName: 'Farmer',
                gender: 'female',
                phone: '08093334444',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results).toHaveLength(3);
      expect(body.results[0]?.outcome).toBe('applied');
      expect(body.results[1]?.outcome).toBe('rejected');
      expect(body.results[2]?.outcome).toBe('applied');

      // Valid ops committed
      const [f1] = await testDb.select().from(farmer).where(eq(farmer.id, validFarmer1Id));
      expect(f1).toBeDefined();
      expect(f1?.farmerCode).toBe('FARM-BATCH-V1');

      const [f3] = await testDb.select().from(farmer).where(eq(farmer.id, validFarmer3Id));
      expect(f3).toBeDefined();
      expect(f3?.farmerCode).toBe('FARM-BATCH-V3');

      // Invalid op rolled back via savepoint, logged in sync_op
      const [f2] = await testDb.select().from(farmer).where(eq(farmer.id, invalidFarmer2Id));
      expect(f2).toBeUndefined();

      const [op2] = await testDb.select().from(syncOp).where(eq(syncOp.opId, invalidOp2Id));
      expect(op2).toBeDefined();
      expect(op2?.outcome).toBe('rejected');
    });

    it('the same batch sent twice: no duplicate rows (opId idempotency across batch)', async () => {
      const idemFarmer1Id = crypto.randomUUID();
      const idemOp1Id = crypto.randomUUID();
      const idemFarmer2Id = crypto.randomUUID();
      const idemOp2Id = crypto.randomUUID();

      const payload = {
        deviceId: validDeviceId,
        ops: [
          {
            opId: idemOp1Id,
            entity: 'farmer',
            action: 'create',
            recordId: idemFarmer1Id,
            baseVersion: 1,
            data: {
              schemeId: KANO_SCHEME_ID,
              farmerCode: 'FARM-IDEM-BATCH-1',
              wardId: KANO_WARD_ID,
              firstName: 'IdemOne',
              lastName: 'Farmer',
              gender: 'male',
              phone: '08094445555',
            },
          },
          {
            opId: idemOp2Id,
            entity: 'farmer',
            action: 'create',
            recordId: idemFarmer2Id,
            baseVersion: 1,
            data: {
              schemeId: KANO_SCHEME_ID,
              farmerCode: 'FARM-IDEM-BATCH-2',
              wardId: KANO_WARD_ID,
              firstName: 'IdemTwo',
              lastName: 'Farmer',
              gender: 'female',
              phone: '08095556666',
            },
          },
        ],
      };

      // First run: both applied
      const res1 = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const body1 = res1.json();
      expect(body1.results[0]?.outcome).toBe('applied');
      expect(body1.results[1]?.outcome).toBe('applied');

      // Second run with exact same payload: returns cached outcomes, no duplicates
      const res2 = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload,
      });
      expect(res2.statusCode).toBe(201);
      const body2 = res2.json();
      expect(body2.results[0]?.outcome).toBe('applied');
      expect(body2.results[1]?.outcome).toBe('applied');

      // Exactly 1 row in farmer table per record
      const f1Rows = await testDb.select().from(farmer).where(eq(farmer.id, idemFarmer1Id));
      expect(f1Rows).toHaveLength(1);

      const f2Rows = await testDb.select().from(farmer).where(eq(farmer.id, idemFarmer2Id));
      expect(f2Rows).toHaveLength(1);
    });

    it('a conflict in the middle of a batch: held as a conflict, the rest commit', async () => {
      // 1. Pre-create a farmer and bump its version to 2
      const existingFarmerId = crypto.randomUUID();
      const initOpId = crypto.randomUUID();
      await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: initOpId,
              entity: 'farmer',
              action: 'create',
              recordId: existingFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-CONF-TARGET',
                wardId: KANO_WARD_ID,
                firstName: 'ConflictTarget',
                lastName: 'Initial',
                gender: 'male',
                phone: '08096667777',
              },
            },
          ],
        },
      });

      // Update farmer directly to version 2
      await testDb
        .update(farmer)
        .set({ version: 2, lastName: 'ServerUpdated' })
        .where(eq(farmer.id, existingFarmerId));

      // 2. Push batch with 3 operations:
      // Op 1: Create valid farmer A
      // Op 2: Update existingFarmerId with stale baseVersion: 1 (triggers conflict)
      // Op 3: Create valid farmer B
      const farmerAId = crypto.randomUUID();
      const opAId = crypto.randomUUID();
      const conflictOpId = crypto.randomUUID();
      const farmerBId = crypto.randomUUID();
      const opBId = crypto.randomUUID();

      const batchRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: opAId,
              entity: 'farmer',
              action: 'create',
              recordId: farmerAId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-BATCH-CONF-A',
                wardId: KANO_WARD_ID,
                firstName: 'BatchFarmerA',
                lastName: 'Farmer',
                gender: 'male',
                phone: '08097778888',
              },
            },
            {
              opId: conflictOpId,
              entity: 'farmer',
              action: 'update',
              recordId: existingFarmerId,
              baseVersion: 1, // Stale! Server is at version 2
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-CONF-TARGET',
                wardId: KANO_WARD_ID,
                firstName: 'DeviceModified',
                lastName: 'StaleUpdate',
                gender: 'male',
                phone: '08096667777',
              },
            },
            {
              opId: opBId,
              entity: 'farmer',
              action: 'create',
              recordId: farmerBId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-BATCH-CONF-B',
                wardId: KANO_WARD_ID,
                firstName: 'BatchFarmerB',
                lastName: 'Farmer',
                gender: 'female',
                phone: '08098889999',
              },
            },
          ],
        },
      });

      expect(batchRes.statusCode).toBe(201);
      const batchBody = batchRes.json();
      expect(batchBody.results).toHaveLength(3);
      expect(batchBody.results[0]?.outcome).toBe('applied');
      expect(batchBody.results[1]?.outcome).toBe('conflict');
      expect(batchBody.results[1]?.conflictId).toBeDefined();
      expect(batchBody.results[2]?.outcome).toBe('applied');

      // Farmer A committed
      const [fA] = await testDb.select().from(farmer).where(eq(farmer.id, farmerAId));
      expect(fA).toBeDefined();

      // Farmer B committed
      const [fB] = await testDb.select().from(farmer).where(eq(farmer.id, farmerBId));
      expect(fB).toBeDefined();

      // Conflict op is logged in sync_conflict and sync_op, target farmer preserved server state
      const [targetFarmer] = await testDb
        .select()
        .from(farmer)
        .where(eq(farmer.id, existingFarmerId));
      expect(targetFarmer?.version).toBe(2);
      expect(targetFarmer?.lastName).toBe('ServerUpdated');

      const [conf] = await testDb
        .select()
        .from(syncConflict)
        .where(eq(syncConflict.opId, conflictOpId));
      expect(conf).toBeDefined();
      expect(conf?.serverVersion).toBe(2);
      expect(conf?.baseVersion).toBe(1);
    });
  });

  describe('Concurrency & Conflict Resolution', () => {
    let conflictFarmerId: string;
    let conflictId: string;

    it('captures stale concurrent update as a conflict in sync_conflict', async () => {
      conflictFarmerId = crypto.randomUUID();
      const createOpId = crypto.randomUUID();

      // 1. Create farmer (version 1)
      await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: createOpId,
              entity: 'farmer',
              action: 'create',
              recordId: conflictFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-CONF-001',
                wardId: KANO_WARD_ID,
                firstName: 'Ibrahim',
                lastName: 'Garko',
                gender: 'male',
                phone: '08099991111',
              },
            },
          ],
        },
      });

      // 2. Server updates farmer twice (version becomes 3)
      await app.inject({
        method: 'PATCH',
        url: `/slis/farmers/${conflictFarmerId}`,
        headers: {
          authorization: `Bearer ${schemeDataOfficerToken}`,
          'if-match': '"1"',
        },
        payload: {
          firstName: 'Ibrahim Server-Updated V2',
        },
      });

      await app.inject({
        method: 'PATCH',
        url: `/slis/farmers/${conflictFarmerId}`,
        headers: {
          authorization: `Bearer ${schemeDataOfficerToken}`,
          'if-match': '"2"',
        },
        payload: {
          firstName: 'Ibrahim Server-Updated V3',
        },
      });

      // 3. Device pushes an update with baseVersion = 1 (stale!)
      const staleOpId = crypto.randomUUID();
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops: [
            {
              opId: staleOpId,
              entity: 'farmer',
              action: 'update',
              recordId: conflictFarmerId,
              baseVersion: 1,
              data: {
                firstName: 'Ibrahim Device-Offline',
              },
            },
          ],
        },
      });

      expect(pushRes.statusCode).toBe(201);
      const body = pushRes.json();
      expect(body.results[0]?.outcome).toBe('conflict');
      expect(body.results[0]?.conflictId).toBeDefined();
      conflictId = body.results[0]?.conflictId;

      // Verify sync_conflict row exists with actual real serverVersion = 3 (not fallback)
      const [conf] = await testDb
        .select()
        .from(syncConflict)
        .where(eq(syncConflict.id, conflictId));
      expect(conf).toBeDefined();
      expect(conf?.status).toBe('open');
      expect(conf?.baseVersion).toBe(1);
      expect(conf?.serverVersion).toBe(3);
    });

    it('lists conflicts scoped to scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/sync/conflicts',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const conflicts = res.json();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c: { id: string }) => c.id === conflictId)).toBe(true);
    });

    it('resolves conflict with accept_device strategy', async () => {
      const resolveRes = await app.inject({
        method: 'POST',
        url: `/slis/sync/conflicts/${conflictId}/resolve`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          resolution: 'accept_device',
        },
      });

      expect(resolveRes.statusCode).toBe(201);
      const body = resolveRes.json();
      expect(body.status).toBe('resolved');

      // Verify farmer firstName was updated to device value
      const [f] = await testDb.select().from(farmer).where(eq(farmer.id, conflictFarmerId));
      expect(f?.firstName).toBe('Ibrahim Device-Offline');
    });
  });

  describe('Offline Grant Expiration & Quarantine', () => {
    let quarantineId: string;
    const testQuarantineFarmerId = crypto.randomUUID();

    it('quarantines ops from device with expired grant', async () => {
      const opId = crypto.randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: expiredDeviceId,
          ops: [
            {
              opId,
              entity: 'farmer',
              action: 'create',
              recordId: testQuarantineFarmerId,
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerCode: 'FARM-KN-Q01',
                wardId: KANO_WARD_ID,
                firstName: 'Quarantined',
                lastName: 'Farmer',
                gender: 'female',
                phone: '08088880000',
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results[0]?.outcome).toBe('quarantined');
      expect(body.results[0]?.quarantineId).toBeDefined();
      expect(body.results[0]?.quarantineReason).toBe('grant_expired');
      quarantineId = body.results[0]?.quarantineId;

      // Farmer was NOT inserted yet
      const [f] = await testDb.select().from(farmer).where(eq(farmer.id, testQuarantineFarmerId));
      expect(f).toBeUndefined();

      // Stored in sync_quarantine
      const [q] = await testDb
        .select()
        .from(syncQuarantine)
        .where(eq(syncQuarantine.id, quarantineId));
      expect(q).toBeDefined();
      expect(q?.reason).toBe('grant_expired');
    });

    it('lists quarantined items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/sync/quarantine',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.some((item: { id: string }) => item.id === quarantineId)).toBe(true);
    });

    it('resolves quarantined operation with applied resolution', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/sync/quarantine/${quarantineId}/resolve`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          resolution: 'applied',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.resolution).toBe('applied');

      // Now farmer IS inserted
      const [f] = await testDb.select().from(farmer).where(eq(farmer.id, testQuarantineFarmerId));
      expect(f).toBeDefined();
      expect(f?.firstName).toBe('Quarantined');
    });

    it('enforces scope isolation: Kano slis_admin cannot list or resolve Lagos quarantine item', async () => {
      const lagosQuarantineId = crypto.randomUUID();
      const lagosOpId = crypto.randomUUID();
      const lagosFarmerId = crypto.randomUUID();

      // Insert a quarantine record directly with Lagos schemeId and stateId
      await testDb.insert(syncQuarantine).values({
        id: lagosQuarantineId,
        deviceId: validDeviceId,
        opId: lagosOpId,
        entity: 'farmer',
        action: 'create',
        recordId: lagosFarmerId,
        baseVersion: 1,
        payload: {
          schemeId: LAGOS_SCHEME_ID,
          stateId: LAGOS_STATE_ID,
          farmerCode: 'FARM-LAG-Q01',
          wardId: LAGOS_WARD_ID,
          firstName: 'Lagos',
          lastName: 'Quarantined',
          gender: 'female',
          phone: '08099998888',
        },
        reason: 'device_revoked',
        schemeId: LAGOS_SCHEME_ID,
        stateId: LAGOS_STATE_ID,
      });

      // 1. Kano slis_admin lists quarantine: Lagos item must NOT appear
      const resList = await app.inject({
        method: 'GET',
        url: '/slis/sync/quarantine',
        headers: { authorization: `Bearer ${kanoSlisAdminToken}` },
      });

      expect(resList.statusCode).toBe(200);
      const items = resList.json();
      expect(items.some((item: { id: string }) => item.id === lagosQuarantineId)).toBe(false);

      // 2. Kano slis_admin attempts to resolve Lagos quarantine: returns 404
      const resResolve = await app.inject({
        method: 'POST',
        url: `/slis/sync/quarantine/${lagosQuarantineId}/resolve`,
        headers: { authorization: `Bearer ${kanoSlisAdminToken}` },
        payload: {
          resolution: 'applied',
        },
      });

      expect(resResolve.statusCode).toBe(404);

      // 3. Verify item in DB is still un-resolved
      const [q] = await testDb
        .select()
        .from(syncQuarantine)
        .where(eq(syncQuarantine.id, lagosQuarantineId));
      expect(q).toBeDefined();
      expect(q?.resolution).toBeNull();
    });
  });

  describe('Safe Watermark Pull & Scope Growth Rebaseline', () => {
    it('pulls changes matching user scope with safe watermark cursor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.nextCursor).toBeDefined();
      expect(body.nextCursor).toMatch(/^\d+:\d+$/);

      // Subsequent pull using returned cursor
      const nextRes = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?cursor=${body.nextCursor}`,
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });

      expect(nextRes.statusCode).toBe(200);
      const nextBody = nextRes.json();
      expect(nextBody.items).toHaveLength(0);
    });

    it('records change_log via triggers on REST create, approval, return, and import, and returns current records in pull', async () => {
      // (a) REST create farmer
      const createRes = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerCode: 'REST-TRG-001',
          wardId: KANO_WARD_ID,
          firstName: 'TriggerRest',
          lastName: 'Farmer',
          gender: 'female',
          phone: '08088887777',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const restFarmer = createRes.json();

      // (b) Submit for review
      const submitRes = await app.inject({
        method: 'POST',
        url: '/slis/review/submit/farmer',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          recordIds: [restFarmer.id],
        },
      });
      expect(submitRes.statusCode).toBe(201);

      // (c) Return with comment (version bumped to 2 by submission)
      const returnRes = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${restFarmer.id}/return`,
        headers: {
          authorization: `Bearer ${schemeDataOfficerToken}`,
          'if-match': '"2"',
        },
        payload: {
          comment: 'fix the phone number',
        },
      });
      expect(returnRes.statusCode).toBe(201);

      // (d) Direct import insert
      const importedFarmerId = crypto.randomUUID();
      await testDb.insert(farmer).values({
        id: importedFarmerId,
        schemeId: KANO_SCHEME_ID,
        farmerCode: 'IMP-TRG-001',
        wardId: KANO_WARD_ID,
        stateId: KANO_STATE_ID,
        firstName: 'TriggerImported',
        lastName: 'Farmer',
        gender: 'male',
        phone: '08011112222',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // (e) Pull changes
      const pullRes = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });
      expect(pullRes.statusCode).toBe(200);
      const pullBody = pullRes.json();

      // Verify returned farmer appears with status returned and returnComment
      const returnedItem = pullBody.items.find(
        (item: { entity: string; recordId: string }) =>
          item.entity === 'farmer' && item.recordId === restFarmer.id,
      );
      expect(returnedItem).toBeDefined();
      expect(returnedItem.op).toBe('upsert');
      expect(returnedItem.data.status).toBe('returned');
      expect(returnedItem.data.returnComment).toBe('fix the phone number');

      // Verify imported farmer appears
      const importedItem = pullBody.items.find(
        (item: { entity: string; recordId: string }) =>
          item.entity === 'farmer' && item.recordId === importedFarmerId,
      );
      expect(importedItem).toBeDefined();
      expect(importedItem.op).toBe('upsert');
      expect(importedItem.data.firstName).toBe('TriggerImported');
    });

    it('scope fingerprint on core.device triggers rebaseline even across Redis flushes', async () => {
      const redis = app.get(RedisService);
      const redisClient = redis.getClient();
      if (redisClient) await redisClient.flushall();

      // Fetch initial pull with deviceId
      const p1 = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });
      expect(p1.statusCode).toBe(200);
      const cursor = p1.json().nextCursor;

      // Next pull with cursor should have rebaseline false
      const p2 = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?cursor=${cursor}`,
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });
      expect(p2.json().rebaseline).toBeFalsy();

      // Flush Redis completely
      if (redisClient) await redisClient.flushall();

      // Subsequent pull with same cursor: should STILL have rebaseline false because fingerprint is on core.device!
      const p3 = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?cursor=${cursor}`,
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });
      expect(p3.json().rebaseline).toBeFalsy();
    });

    it('signals rebaseline: true when user scope grows with new scheme', async () => {
      // Assign Field Officer to Kaduna Scheme
      await testDb.insert(assignment).values([
        {
          id: crypto.randomUUID(),
          userId: FIELD_OFFICER_ID,
          roleId: ROLE_FIELD_OFFICER_ID,
          module: 'slis',
          scopeType: 'scheme',
          scopeOrgId: KADUNA_SCHEME_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      // Invalidate RBAC cache
      const authzService = app.get(AuthzService);
      await authzService.incrementRbacEpoch();

      const res = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull?cursor=1000:1',
        headers: {
          authorization: `Bearer ${fieldOfficerToken}`,
          'x-device-id': validDeviceId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rebaseline).toBe(true);
      expect(body.activeSchemeIds).toContain(KADUNA_SCHEME_ID);
    });

    it('composite (xid, seq) cursor guarantees zero missed records during interleaved transaction commits', async () => {
      // Create two dedicated reserved Postgres connections to simulate concurrent transactions TxA and TxB
      const clientA = postgres(testDbUrl, { max: 1 });
      const clientB = postgres(testDbUrl, { max: 1 });

      const recordAId = crypto.randomUUID();
      const recordBId = crypto.randomUUID();

      try {
        const connA = await clientA.reserve();
        const connB = await clientB.reserve();

        try {
          // 1. TxA begins and acquires an xid
          await connA.unsafe('BEGIN;');
          const [xactA] = await connA.unsafe<{ xid: string }[]>(
            'SELECT pg_current_xact_id()::text as xid;',
          );
          const xidA = xactA!.xid;

          // 2. TxB begins and acquires an xid (xidB > xidA)
          await connB.unsafe('BEGIN;');
          const [xactB] = await connB.unsafe<{ xid: string }[]>(
            'SELECT pg_current_xact_id()::text as xid;',
          );
          const xidB = xactB!.xid;

          expect(BigInt(xidB)).toBeGreaterThan(BigInt(xidA));

          // 3. TxB writes to farmer first (gets lower seq), then COMMITS
          await connB.unsafe(`
            INSERT INTO "slis"."farmer" ("id", "scheme_id", "ward_id", "state_id", "farmer_code", "first_name", "last_name", "gender", "created_by", "updated_by")
            VALUES ('${recordBId}', '${KANO_SCHEME_ID}', '${KANO_WARD_ID}', '${KANO_STATE_ID}', 'TXB-001', 'Farmer B', 'LastName', 'male', '${SYSTEM_USER_ID}', '${SYSTEM_USER_ID}');
          `);
          await connB.unsafe('COMMIT;');

          // 4. While TxA is still open, a pull should NOT return TxB yet
          // because TxB.xid >= pg_snapshot_xmin() (TxA holds back xmin!)
          const inProgressRes = await app.inject({
            method: 'GET',
            url: '/slis/sync/pull',
            headers: {
              authorization: `Bearer ${fieldOfficerToken}`,
              'x-device-id': validDeviceId,
            },
          });
          const inProgressBody = inProgressRes.json();
          const foundBWhileOpen = inProgressBody.items.some(
            (i: { recordId: string }) => i.recordId === recordBId,
          );
          expect(foundBWhileOpen).toBe(false);

          // 5. TxA now writes to farmer (gets higher seq) and COMMITS
          await connA.unsafe(`
            INSERT INTO "slis"."farmer" ("id", "scheme_id", "ward_id", "state_id", "farmer_code", "first_name", "last_name", "gender", "created_by", "updated_by")
            VALUES ('${recordAId}', '${KANO_SCHEME_ID}', '${KANO_WARD_ID}', '${KANO_STATE_ID}', 'TXA-001', 'Farmer A', 'LastName', 'male', '${SYSTEM_USER_ID}', '${SYSTEM_USER_ID}');
          `);
          await connA.unsafe('COMMIT;');

          // 6. Now both are committed. Pull changes:
          // Ordering by (xid, seq) guarantees TxA (older transaction) is processed BEFORE TxB,
          // so moving cursor through TxA to TxB never misses or skips either!
          const finalRes = await app.inject({
            method: 'GET',
            url: '/slis/sync/pull',
            headers: {
              authorization: `Bearer ${fieldOfficerToken}`,
              'x-device-id': validDeviceId,
            },
          });
          const finalBody = finalRes.json();
          const foundA = finalBody.items.find(
            (i: { recordId: string }) => i.recordId === recordAId,
          );
          const foundB = finalBody.items.find(
            (i: { recordId: string }) => i.recordId === recordBId,
          );

          expect(foundA).toBeDefined();
          expect(foundB).toBeDefined();

          const idxA = finalBody.items.indexOf(foundA);
          const idxB = finalBody.items.indexOf(foundB);
          // Older transaction TxA MUST appear before TxB in the change log stream
          expect(idxA).toBeLessThan(idxB);
        } finally {
          await connA.release();
          await connB.release();
        }
      } finally {
        await clientA.end();
        await clientB.end();
      }
    });
  });

  describe('BLIS Dam Safety Inspection Sync Pull Scoping', () => {
    it("an RBDA user pulls only their basin's dam inspections; a user in another RBDA gets none", async () => {
      // 1. Set up second RBDA with its own basin and dam
      const otherRbdaId = crypto.randomUUID();
      await testDb.insert(organisation).values({
        id: otherRbdaId,
        type: 'rbda',
        code: `RBDA-OTHER-${Date.now().toString(36)}`,
        name: 'Sokoto-Rima RBDA',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const otherBasinId = crypto.randomUUID();
      await testDb.insert(basin).values({
        id: otherBasinId,
        rbdaId: otherRbdaId,
        name: 'Sokoto Basin',
        code: `BASIN-SOKOTO-${Date.now().toString(36)}`,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const otherDamId = crypto.randomUUID();
      await testDb.insert(dam).values({
        id: otherDamId,
        basinId: otherBasinId,
        name: 'Bakolori Dam',
        code: `DAM-BAKOLORI-${Date.now().toString(36)}`,
        lgaId: KADUNA_LGA_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // 2. Insert dam inspections: one in TEST_RBDA_ID (via testDamId/testBasinId), one in otherRbdaId (via otherDamId/otherBasinId)
      const inspection1Id = crypto.randomUUID();
      const inspection2Id = crypto.randomUUID();

      await testDb.insert(damSafetyInspection).values([
        {
          id: inspection1Id,
          damId: testDamId, // Under TEST_RBDA_ID
          inspectedOn: '2026-04-01',
          meetsStandard: true,
          status: 'submitted',
          version: 1,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: inspection2Id,
          damId: otherDamId, // Under otherRbdaId
          inspectedOn: '2026-04-02',
          meetsStandard: false,
          status: 'submitted',
          version: 1,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      // Verify trigger inserted them into change_log with scheme_id = NULL
      const logRows = await testDb
        .select()
        .from(changeLog)
        .where(
          and(
            eq(changeLog.entity, 'dam_safety_inspection'),
            inArray(changeLog.recordId, [inspection1Id, inspection2Id]),
          ),
        );
      expect(logRows).toHaveLength(2);
      for (const row of logRows) {
        expect(row.schemeId).toBeNull();
      }
      const log1 = logRows.find((r) => r.recordId === inspection1Id);
      const log2 = logRows.find((r) => r.recordId === inspection2Id);
      expect(log1?.basinId).toBe(testBasinId);
      expect(log2?.basinId).toBe(otherBasinId);

      // 3. User A with RBDA scope for TEST_RBDA_ID
      const userAId = crypto.randomUUID();
      const userADeviceId = crypto.randomUUID();
      await testDb.insert(appUser).values({
        id: userAId,
        email: `rbda1-${Date.now()}@idmis.gov.ng`,
        passwordHash: await argon2.hash('Password123!', { type: argon2.argon2id }),
        fullName: 'RBDA 1 User',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(assignment).values({
        id: crypto.randomUUID(),
        userId: userAId,
        roleId: ROLE_FIELD_OFFICER_ID,
        module: 'slis',
        scopeType: 'rbda',
        scopeOrgId: TEST_RBDA_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(device).values({
        id: userADeviceId,
        installationId: crypto.randomUUID(),
        userId: userAId,
        label: 'RBDA 1 Device',
        platform: 'android',
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      });
      const sidA = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sidA,
        familyId: crypto.randomUUID(),
        userId: userAId,
        refreshTokenHash: crypto.randomUUID(),
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const tokenA = (await tokenService.createAccessToken(userAId, sidA)).accessToken;

      // 4. User B with RBDA scope for otherRbdaId
      const userBId = crypto.randomUUID();
      const userBDeviceId = crypto.randomUUID();
      await testDb.insert(appUser).values({
        id: userBId,
        email: `rbda2-${Date.now()}@idmis.gov.ng`,
        passwordHash: await argon2.hash('Password123!', { type: argon2.argon2id }),
        fullName: 'RBDA 2 User',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(assignment).values({
        id: crypto.randomUUID(),
        userId: userBId,
        roleId: ROLE_FIELD_OFFICER_ID,
        module: 'slis',
        scopeType: 'rbda',
        scopeOrgId: otherRbdaId,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
      await testDb.insert(device).values({
        id: userBDeviceId,
        installationId: crypto.randomUUID(),
        userId: userBId,
        label: 'RBDA 2 Device',
        platform: 'android',
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      });
      const sidB = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sidB,
        familyId: crypto.randomUUID(),
        userId: userBId,
        refreshTokenHash: crypto.randomUUID(),
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const tokenB = (await tokenService.createAccessToken(userBId, sidB)).accessToken;

      // 5. User A pulls: must get inspection1, must NOT get inspection2
      const resA = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-device-id': userADeviceId,
        },
      });
      expect(resA.statusCode).toBe(200);
      const bodyA = resA.json();
      const inspectionsA = bodyA.items.filter(
        (i: { entity: string }) => i.entity === 'dam_safety_inspection',
      );
      const foundA1 = inspectionsA.find((i: { recordId: string }) => i.recordId === inspection1Id);
      const foundA2 = inspectionsA.find((i: { recordId: string }) => i.recordId === inspection2Id);
      expect(foundA1).toBeDefined();
      expect(foundA1.schemeId).toBeNull();
      expect(foundA2).toBeUndefined();

      // 6. User B pulls: must get inspection2, must NOT get inspection1
      const resB = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-device-id': userBDeviceId,
        },
      });
      expect(resB.statusCode).toBe(200);
      const bodyB = resB.json();
      const inspectionsB = bodyB.items.filter(
        (i: { entity: string }) => i.entity === 'dam_safety_inspection',
      );
      const foundB1 = inspectionsB.find((i: { recordId: string }) => i.recordId === inspection1Id);
      const foundB2 = inspectionsB.find((i: { recordId: string }) => i.recordId === inspection2Id);
      expect(foundB2).toBeDefined();
      expect(foundB2.schemeId).toBeNull();
      expect(foundB1).toBeUndefined();
    });
  });

  describe('Gate Test: 500 Queued Operations Sync With Zero Loss', () => {
    it('processes 500 queued operations in a single push without loss', async () => {
      const ops = [];
      const recordIds = [];

      for (let i = 0; i < 500; i++) {
        const id = crypto.randomUUID();
        recordIds.push(id);
        ops.push({
          opId: crypto.randomUUID(),
          entity: 'water_request',
          action: 'create' as const,
          recordId: id,
          baseVersion: 1,
          data: {
            schemeId: KANO_SCHEME_ID,
            level: 'individual',
            farmerId: testFarmerId,
            volumeM3: '100.0000',
          },
        });
      }

      const startTime = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          deviceId: validDeviceId,
          ops,
        },
      });

      const durationMs = Date.now() - startTime;

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.results).toHaveLength(500);

      // Check all 500 applied
      const appliedCount = body.results.filter(
        (r: { outcome: string }) => r.outcome === 'applied',
      ).length;
      expect(appliedCount).toBe(500);

      // Verify database count
      const dbCount = await testDb
        .select()
        .from(waterRequest)
        .where(eq(waterRequest.schemeId, KANO_SCHEME_ID));

      expect(dbCount.length).toBeGreaterThanOrEqual(500);
      // Performance check: ensure all 500 processed efficiently (< 15 seconds)
      expect(durationMs).toBeLessThan(15000);
    });
  });
});
