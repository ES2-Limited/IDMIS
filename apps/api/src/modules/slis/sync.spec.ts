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
import { AuthzService } from '../../platform/auth';
import { initAuditWriter } from '../../platform/audit/audit-writer';

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
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KADUNA_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const KADUNA_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KANO_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000003';
  const KADUNA_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';

  const FIELD_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000010';
  const SCHEME_DATA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000020';

  const ROLE_FIELD_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000010';
  const ROLE_SCHEME_DATA_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000020';

  let fieldOfficerToken: string;
  let schemeDataOfficerToken: string;
  let testFarmerId: string;

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
    ]);

    await testDb.insert(lga).values([
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KN-KMC', name: 'Kano Municipal' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KD-KDN', name: 'Kaduna North' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KN-WARD-1', name: 'Kano Central Ward' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KD-WARD-1', name: 'Kaduna Central Ward' },
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
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: KANO_SECTOR_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_SCHEME_ID, stateId: KADUNA_STATE_ID },
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

      // Scheme data officer: all above + conflict resolve
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_PUSH },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_PULL },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_SYNC_CONFLICT_RESOLVE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_CREATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_WATER_REQUEST_READ },
    ]);

    // 5. Assignments (Both scoped to Kano Scheme & State)
    await testDb.insert(assignment).values([
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

    // 7. Sessions & JWT tokens
    const sid1 = crypto.randomUUID();
    const sid2 = crypto.randomUUID();
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
    ]);

    fieldOfficerToken = (await tokenService.createAccessToken(FIELD_OFFICER_ID, sid1)).accessToken;
    schemeDataOfficerToken = (await tokenService.createAccessToken(SCHEME_DATA_OFFICER_ID, sid2))
      .accessToken;
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

      // 2. Server updates farmer (version becomes 2)
      await app.inject({
        method: 'PATCH',
        url: `/slis/farmers/${conflictFarmerId}`,
        headers: {
          authorization: `Bearer ${schemeDataOfficerToken}`,
          'if-match': '"1"',
        },
        payload: {
          firstName: 'Ibrahim Server-Updated',
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

      // Verify sync_conflict row exists
      const [conf] = await testDb
        .select()
        .from(syncConflict)
        .where(eq(syncConflict.id, conflictId));
      expect(conf).toBeDefined();
      expect(conf?.status).toBe('open');
      expect(conf?.baseVersion).toBe(1);
      expect(conf?.serverVersion).toBe(2);
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

          // 3. TxB writes to change_log first (gets lower seq), then COMMITS
          await connB.unsafe(`
            INSERT INTO "core"."change_log" ("entity", "record_id", "op", "scheme_id", "data")
            VALUES ('farmer', '${recordBId}', 'upsert', '${KANO_SCHEME_ID}', '{"name": "Farmer B"}');
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

          // 5. TxA now writes to change_log (gets higher seq) and COMMITS
          await connA.unsafe(`
            INSERT INTO "core"."change_log" ("entity", "record_id", "op", "scheme_id", "data")
            VALUES ('farmer', '${recordAId}', 'upsert', '${KANO_SCHEME_ID}', '{"name": "Farmer A"}');
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
