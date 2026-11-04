import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { permissions, ME_IMPORT_TEMPLATES } from '@idmis/contracts';
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
  file,
  device,
  scorecard,
  matchingGrant,
  techAdoption,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
  isNull,
  sql,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('M&E Scorecards, Matching Grants, Tech Adoption Sync & Imports (BE-3.5)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_me_inst_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test User IDs
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const KANO_ME_OFFICER_ID = crypto.randomUUID();
  const KANO_STATE_OFFICER_ID = crypto.randomUUID();
  const KANO_FIELD_OFFICER_ID = crypto.randomUUID();
  const LAGOS_ME_OFFICER_ID = crypto.randomUUID();
  const SYSTEM_USER_ID = crypto.randomUUID();

  // Role IDs
  const ME_NATIONAL_ROLE_ID = crypto.randomUUID();
  const ME_OFFICER_ROLE_ID = crypto.randomUUID();
  const FIELD_OFFICER_ROLE_ID = crypto.randomUUID();

  // Geography & Scheme IDs
  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();
  const LAGOS_SCHEME_ID = crypto.randomUUID();

  // Additional Entities
  const KANO_WUA_ID = crypto.randomUUID();
  const TEST_FILE_ID = crypto.randomUUID();
  const TEST_TECH_TYPE_ID = crypto.randomUUID();
  const TEST_TECH_ID = crypto.randomUUID();

  // Devices
  const KANO_DEVICE_ID = crypto.randomUUID();
  const KANO_FIELD_DEVICE_ID = crypto.randomUUID();
  const LAGOS_DEVICE_ID = crypto.randomUUID();

  // Tokens
  let nationalToken: string;
  let kanoOfficerToken: string;
  let kanoStateOfficerToken: string;
  let kanoFieldOfficerToken: string;
  let lagosOfficerToken: string;

  const mockStorageFiles = new Map<string, Buffer>();

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
    storageService = app.get(StorageService);

    storageService.getObjectBuffer = async (storageKey: string) => {
      const buf = mockStorageFiles.get(storageKey);
      if (!buf) throw new Error(`Mock storage file not found: ${storageKey}`);
      return buf;
    };

    // 3. Seed Users, Roles, Geography & Schemes
    const now = new Date().toISOString();

    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System Admin',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: NATIONAL_ADMIN_ID,
        email: 'national.admin@idmis.gov.ng',
        fullName: 'National Admin',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_ME_OFFICER_ID,
        email: 'kano.me@idmis.gov.ng',
        fullName: 'Kano MEOfficer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_STATE_OFFICER_ID,
        email: 'kano.state@idmis.gov.ng',
        fullName: 'Kano State Officer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_FIELD_OFFICER_ID,
        email: 'kano.field@idmis.gov.ng',
        fullName: 'Kano Field Officer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_ME_OFFICER_ID,
        email: 'lagos.me@idmis.gov.ng',
        fullName: 'Lagos MEOfficer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano',
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

    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        code: 'LRIS',
        name: 'Lagos Scheme',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // Roles and permissions
    await testDb.insert(role).values([
      {
        id: ME_NATIONAL_ROLE_ID,
        key: 'me_national_lead',
        name: 'M&E National Lead',
        description: 'National',
      },
      {
        id: ME_OFFICER_ROLE_ID,
        key: 'me_officer',
        name: 'M&E Officer',
        description: 'Officer',
      },
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: 'field_officer',
        name: 'Field Officer',
        description: 'Field Officer',
      },
    ]);

    const mePerms = [
      permissions.ME_INSTRUMENTS_MANAGE,
      permissions.ME_ADOPTION_RECORD,
      permissions.ME_INDICATOR_READ,
      permissions.ME_VALUE_APPROVE,
      permissions.CORE_IMPORT_RUN,
      permissions.SLIS_SYNC_PUSH,
      permissions.SLIS_SYNC_PULL,
    ];

    for (const p of mePerms) {
      await testDb.insert(rolePermission).values({ roleId: ME_NATIONAL_ROLE_ID, permission: p });
      await testDb.insert(rolePermission).values({ roleId: ME_OFFICER_ROLE_ID, permission: p });
    }

    const fieldPerms = [
      permissions.ME_ADOPTION_RECORD,
      permissions.ME_INDICATOR_READ,
      permissions.SLIS_SYNC_PUSH,
      permissions.SLIS_SYNC_PULL,
    ];

    for (const p of fieldPerms) {
      await testDb.insert(rolePermission).values({ roleId: FIELD_OFFICER_ROLE_ID, permission: p });
    }

    // Role Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: NATIONAL_ADMIN_ID,
        roleId: ME_NATIONAL_ROLE_ID,
        module: 'me',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_ME_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_FIELD_OFFICER_ID,
        roleId: FIELD_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_STATE_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'state',
        scopeStateId: KANO_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: LAGOS_ME_OFFICER_ID,
        roleId: ME_OFFICER_ROLE_ID,
        module: 'me',
        scopeType: 'scheme',
        scopeOrgId: LAGOS_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Seed WUA, Lookup, File
    await testDb.insert(wua).values({
      id: KANO_WUA_ID,
      level: 'unit',
      organisationId: KANO_SCHEME_ID,
      name: 'Kano North WUA',
      regNo: 'WUA-KN-001',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(file).values({
      id: TEST_FILE_ID,
      storageKey: 'reports/kris-scorecard-2026.pdf',
      originalName: 'kris-scorecard-2026.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(lookupType).values({
      id: TEST_TECH_TYPE_ID,
      key: 'technology',
      name: 'Agricultural Technologies',
      module: 'me',
    });

    await testDb.insert(lookupValue).values({
      id: TEST_TECH_ID,
      lookupTypeId: TEST_TECH_TYPE_ID,
      code: 'drip_irrigation',
      label: 'Drip Irrigation',
    });

    // Seed devices
    await testDb.insert(device).values([
      {
        id: KANO_DEVICE_ID,
        userId: KANO_ME_OFFICER_ID,
        installationId: crypto.randomUUID(),
        platform: 'android',
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: KANO_FIELD_DEVICE_ID,
        userId: KANO_FIELD_OFFICER_ID,
        installationId: crypto.randomUUID(),
        platform: 'android',
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        id: LAGOS_DEVICE_ID,
        userId: LAGOS_ME_OFFICER_ID,
        installationId: crypto.randomUUID(),
        platform: 'android',
        offlineGrantUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    // Sessions & Tokens
    const createSession = async (userId: string) => {
      const sessionId = crypto.randomUUID();
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      await testDb.insert(session).values({
        id: sessionId,
        familyId,
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt,
        createdAt: now,
      });
      return (await tokenService.createAccessToken(userId, sessionId)).accessToken;
    };

    nationalToken = await createSession(NATIONAL_ADMIN_ID);
    kanoOfficerToken = await createSession(KANO_ME_OFFICER_ID);
    kanoStateOfficerToken = await createSession(KANO_STATE_OFFICER_ID);
    kanoFieldOfficerToken = await createSession(KANO_FIELD_OFFICER_ID);
    lagosOfficerToken = await createSession(LAGOS_ME_OFFICER_ID);
  });

  afterAll(async () => {
    resetAuditWriter();
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore drop error
      }
      await adminClient.end();
    }
  });

  describe('Scorecards CRUD & Scoping (BE-3.5)', () => {
    let createdScorecardId: string;

    it('creates a scorecard with valid fileId for assigned scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          periodYear: 2026,
          publishedOn: '2026-06-30',
          fileId: TEST_FILE_ID,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.schemeId).toBe(KANO_SCHEME_ID);
      expect(body.periodYear).toBe(2026);
      expect(body.fileId).toBe(TEST_FILE_ID);
      expect(body.version).toBe(1);
      createdScorecardId = body.id;
    });

    it('rejects scorecard creation with non-existent fileId with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          periodYear: 2027,
          fileId: crypto.randomUUID(),
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects duplicate scorecard for scheme and year with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          periodYear: 2026,
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('rejects scorecard creation for out-of-scope scheme with 404/403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: LAGOS_SCHEME_ID,
          periodYear: 2028,
        },
      });

      expect([403, 404]).toContain(res.statusCode);
    });

    it('allows state officer to view and update scorecard in their state', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/me/scorecards/${createdScorecardId}`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/me/scorecards/${createdScorecardId}`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: {
          publishedOn: '2026-07-15',
          version: 1,
        },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().version).toBe(2);
      expect(updateRes.json().publishedOn).toBe('2026-07-15');
    });

    it('enforces optimistic concurrency: stale version returns 409 Conflict', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/scorecards/${createdScorecardId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          publishedOn: '2026-08-01',
          version: 1, // Stale: current is 2
        },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('Matching Grants CRUD, Scoping & Money Handling (BE-3.5)', () => {
    let createdGrantId: string;

    it('creates matching grant with decimal string amount and assigned scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/grants',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wuaId: KANO_WUA_ID,
          purpose: 'Main canal desilting',
          amountNgn: '1500000.50',
          approvedOn: '2026-03-01',
          disbursedOn: '2026-04-01',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.schemeId).toBe(KANO_SCHEME_ID);
      expect(body.wuaId).toBe(KANO_WUA_ID);
      expect(body.amountNgn).toBe('1500000.50');
      expect(body.version).toBe(1);
      createdGrantId = body.id;
    });

    it('rejects matching grant creation for out-of-scope scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/grants',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: LAGOS_SCHEME_ID,
          purpose: 'Lagos pump maintenance',
          amountNgn: '500000.00',
        },
      });

      expect([403, 404]).toContain(res.statusCode);
    });

    it('lists matching grants within caller scope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me/grants',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.every((g: { schemeId: string }) => g.schemeId === KANO_SCHEME_ID)).toBe(
        true,
      );
    });

    it('updates matching grant with optimistic locking', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/grants/${createdGrantId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          amountNgn: '1600000.00',
          version: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().amountNgn).toBe('1600000.00');
      expect(res.json().version).toBe(2);
    });
  });

  describe('Technology Adoption CRUD & Gender Capture (BE-3.5)', () => {
    let createdAdoptionId: string;
    const farmerId = crypto.randomUUID();

    it('creates tech adoption record with required gender', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId,
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-05-10',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.gender).toBe('female');
      expect(body.farmerId).toBe(farmerId);
      expect(body.technologyId).toBe(TEST_TECH_ID);
      expect(body.version).toBe(1);
      createdAdoptionId = body.id;
    });

    it('rejects tech adoption record missing gender or with invalid gender with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: crypto.randomUUID(),
          technologyId: TEST_TECH_ID,
          gender: 'unknown',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects tech adoption record with non-existent technology lookup with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: crypto.randomUUID(),
          technologyId: crypto.randomUUID(),
          gender: 'male',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects tech adoption creation for out-of-scope scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: LAGOS_SCHEME_ID,
          farmerId: crypto.randomUUID(),
          technologyId: TEST_TECH_ID,
          gender: 'male',
        },
      });

      expect([403, 404]).toContain(res.statusCode);
    });

    it('updates tech adoption with optimistic locking', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/tech-adoption/${createdAdoptionId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          adoptedOn: '2026-05-20',
          version: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().version).toBe(2);
      expect(res.json().adoptedOn).toBe('2026-05-20');
    });
  });

  describe('Offline Sync Push & Pull for Tech Adoption (BE-3.5)', () => {
    const syncFarmerId = crypto.randomUUID();
    const syncRecordId = crypto.randomUUID();
    const opId = crypto.randomUUID();

    it('applies offline captured tech_adoption push atomically and copies gender at capture', async () => {
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          deviceId: KANO_DEVICE_ID,
          ops: [
            {
              opId,
              entity: 'tech_adoption',
              recordId: syncRecordId,
              action: 'create',
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerId: syncFarmerId,
                technologyId: TEST_TECH_ID,
                gender: 'male',
                adoptedOn: '2026-06-01',
              },
            },
          ],
        },
      });

      expect([200, 201]).toContain(pushRes.statusCode);
      const pushBody = pushRes.json();
      expect(pushBody.results).toHaveLength(1);
      expect(pushBody.results[0].outcome).toBe('applied');

      // Verify row exists directly in database with exact gender
      const [saved] = await testDb
        .select()
        .from(techAdoption)
        .where(eq(techAdoption.id, syncRecordId));
      expect(saved).toBeDefined();
      expect(saved.gender).toBe('male');
      expect(saved.farmerId).toBe(syncFarmerId);
    });

    it('sync pull returns tech_adoption as upsert to device in same scheme', async () => {
      const pullRes = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?deviceId=${KANO_DEVICE_ID}&limit=50`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(pullRes.statusCode).toBe(200);
      const pullBody = pullRes.json();
      const techChanges = pullBody.items.filter(
        (c: { entity: string }) => c.entity === 'tech_adoption',
      );
      expect(techChanges.length).toBeGreaterThanOrEqual(1);

      const target = techChanges.find((c: { recordId: string }) => c.recordId === syncRecordId);
      expect(target).toBeDefined();
      expect(target.op).toBe('upsert');
      expect(target.data.gender).toBe('male');
    });

    it('sync pull by Lagos officer does NOT receive Kano tech_adoption', async () => {
      const pullRes = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?deviceId=${LAGOS_DEVICE_ID}&limit=50`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
      });

      expect(pullRes.statusCode).toBe(200);
      const pullBody = pullRes.json();
      const target = pullBody.items.find((c: { recordId: string }) => c.recordId === syncRecordId);
      expect(target).toBeUndefined();
    });

    it('field_officer creates tech_adoption via sync push -> submitted; field_officer cannot create a scorecard or grant (403)', async () => {
      const fieldFarmerId = crypto.randomUUID();
      const fieldRecordId = crypto.randomUUID();
      const fieldOpId = crypto.randomUUID();

      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${kanoFieldOfficerToken}` },
        payload: {
          deviceId: KANO_FIELD_DEVICE_ID,
          ops: [
            {
              opId: fieldOpId,
              entity: 'tech_adoption',
              recordId: fieldRecordId,
              action: 'create',
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerId: fieldFarmerId,
                technologyId: TEST_TECH_ID,
                gender: 'female',
                adoptedOn: '2026-06-05',
              },
            },
          ],
        },
      });

      expect([200, 201]).toContain(pushRes.statusCode);
      const pushBody = pushRes.json();
      expect(pushBody.results).toHaveLength(1);
      expect(pushBody.results[0].outcome).toBe('applied');

      const [saved] = await testDb
        .select()
        .from(techAdoption)
        .where(eq(techAdoption.id, fieldRecordId));
      expect(saved).toBeDefined();
      expect(saved.status).toBe('submitted');
      expect(saved.submittedBy).toBe(KANO_FIELD_OFFICER_ID);
      expect(saved.gender).toBe('female');

      // field_officer cannot create a scorecard (403)
      const scRes = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${kanoFieldOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          periodYear: 2027,
          fileId: TEST_FILE_ID,
        },
      });
      expect(scRes.statusCode).toBe(403);

      // field_officer cannot create a matching grant (403)
      const grantRes = await app.inject({
        method: 'POST',
        url: '/me/grants',
        headers: { authorization: `Bearer ${kanoFieldOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wuaId: KANO_WUA_ID,
          purpose: 'Unauthorized pump purchase',
          amountNgn: '100000.00',
        },
      });
      expect(grantRes.statusCode).toBe(403);
    });
  });

  describe('Technology Adoption Approval & Return Workflow (BE-3.5)', () => {
    let adoptionId: string;

    beforeEach(async () => {
      // Create a fresh tech adoption record submitted by kanoOfficerToken (KANO_ME_OFFICER_ID)
      const res = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: crypto.randomUUID(),
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-06-10',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('submitted');
      expect(body.submittedBy).toBe(KANO_ME_OFFICER_ID);
      adoptionId = body.id;
    });

    it('rejects self-approval with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/tech-adoption/${adoptionId}/approve`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { version: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects return without comment with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/tech-adoption/${adoptionId}/return`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: {
          version: 1,
          comment: '   ',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('allows an in-scope approver to return with comment and editing resets to submitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/tech-adoption/${adoptionId}/return`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: {
          version: 1,
          comment: 'Farmer photo proof missing',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('returned');
      expect(body.returnComment).toBe('Farmer photo proof missing');
      expect(body.returnedBy).toBe(KANO_STATE_OFFICER_ID);
      expect(body.version).toBe(2);

      // Editing returned record resets status back to submitted
      const editRes = await app.inject({
        method: 'PUT',
        url: `/me/tech-adoption/${adoptionId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          adoptedOn: '2026-06-12',
          version: 2,
        },
      });
      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().status).toBe('submitted');
      expect(editRes.json().version).toBe(3);
    });

    it('allows an in-scope approver to approve, locking edits which reset status to submitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/tech-adoption/${adoptionId}/approve`,
        headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
        payload: { version: 1 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('approved');
      expect(body.approvedBy).toBe(KANO_STATE_OFFICER_ID);
      expect(body.version).toBe(2);

      // Any edit on approved record resets status back to submitted
      const editRes = await app.inject({
        method: 'PUT',
        url: `/me/tech-adoption/${adoptionId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          adoptedOn: '2026-06-20',
          version: 2,
        },
      });
      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().status).toBe('submitted');
      expect(editRes.json().version).toBe(3);
    });
  });

  describe('Import Round-Trips for Scorecard, Matching Grant and Tech Adoption (BE-3.5)', () => {
    const uploadAndValidate = async (
      dataset: 'me.scorecard' | 'me.matching_grant' | 'me.tech_adoption',
      rows: Record<string, unknown>[],
      token: string,
    ) => {
      const workbook = new ExcelJS.Workbook();
      const version = 1;
      workbook.description = JSON.stringify({ dataset, version });
      workbook.keywords = `templateVersion:${version};dataset:${dataset}`;
      workbook.subject = String(version);
      const metaSheet = workbook.addWorksheet('_metadata');
      metaSheet.state = 'veryHidden';
      metaSheet.getCell('A1').value = 'template_version';
      metaSheet.getCell('B1').value = version;
      metaSheet.getCell('A2').value = 'dataset';
      metaSheet.getCell('B2').value = dataset;

      const sheet = workbook.addWorksheet('Data');
      const columns = ME_IMPORT_TEMPLATES[dataset];

      sheet.columns = columns.map((col) => ({
        header: `${col.header}${col.required ? ' *' : ''}`,
        key: col.name,
        width: 20,
      }));

      for (const r of rows) {
        sheet.addRow(r);
      }
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const fileId = crypto.randomUUID();
      const storageKey = `imports/${fileId}.xlsx`;
      mockStorageFiles.set(storageKey, buffer);

      const now = new Date().toISOString();
      await testDb.insert(file).values({
        id: fileId,
        storageKey,
        originalName: `${dataset}_import.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        scanStatus: 'clean',
        createdAt: now,
        createdBy: NATIONAL_ADMIN_ID,
        updatedAt: now,
        updatedBy: NATIONAL_ADMIN_ID,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileId,
          dataset,
          schemeId: KANO_SCHEME_ID,
        },
      });
      expect(res.statusCode).toBe(201);
      const batch = res.json();

      let validatedBatch = batch;
      for (let i = 0; i < 30; i++) {
        const getRes = await app.inject({
          method: 'GET',
          url: `/imports/${batch.id}`,
          headers: { authorization: `Bearer ${token}` },
        });
        validatedBatch = getRes.json();
        if (
          validatedBatch.status === 'validated' ||
          validatedBatch.status === 'validation_failed'
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      return validatedBatch;
    };

    it('completes template -> preview -> commit -> undo round trip for me.scorecard', async () => {
      const batch = await uploadAndValidate(
        'me.scorecard',
        [{ schemeCode: 'KRIS', periodYear: 2029, publishedOn: '2029-06-30' }],
        nationalToken,
      );
      expect(batch.status).toBe('validated');
      expect(batch.validRows).toBe(1);
      expect(batch.errorRows).toBe(0);

      // Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(previewRes.statusCode).toBe(200);

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(commitRes.statusCode);

      // Verify row exists in DB
      const [importedScorecard] = await testDb
        .select()
        .from(scorecard)
        .where(
          and(
            eq(scorecard.schemeId, KANO_SCHEME_ID),
            eq(scorecard.periodYear, 2029),
            isNull(scorecard.deletedAt),
          ),
        );
      expect(importedScorecard).toBeDefined();
      expect(importedScorecard.publishedOn).toBe('2029-06-30');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(undoRes.statusCode);

      // Verify row is soft deleted
      const [undoneScorecard] = await testDb
        .select()
        .from(scorecard)
        .where(
          and(
            eq(scorecard.schemeId, KANO_SCHEME_ID),
            eq(scorecard.periodYear, 2029),
            isNull(scorecard.deletedAt),
          ),
        );
      expect(undoneScorecard).toBeUndefined();
    });

    it('completes template -> preview -> commit -> undo round trip for me.matching_grant', async () => {
      const batch = await uploadAndValidate(
        'me.matching_grant',
        [
          {
            schemeCode: 'KRIS',
            wuaRegNo: 'WUA-KN-001',
            purpose: 'Canal lining upgrade',
            amountNgn: '3500000.00',
            approvedOn: '2026-04-01',
            disbursedOn: '2026-05-01',
          },
        ],
        nationalToken,
      );
      expect(batch.status).toBe('validated');
      expect(batch.validRows).toBe(1);
      expect(batch.errorRows).toBe(0);

      // Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(previewRes.statusCode).toBe(200);

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(commitRes.statusCode);

      // Verify row exists in DB with correct decimal amount
      const [importedGrant] = await testDb
        .select()
        .from(matchingGrant)
        .where(
          and(
            eq(matchingGrant.schemeId, KANO_SCHEME_ID),
            eq(matchingGrant.purpose, 'Canal lining upgrade'),
            isNull(matchingGrant.deletedAt),
          ),
        );
      expect(importedGrant).toBeDefined();
      expect(importedGrant.amountNgn).toBe('3500000.00');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(undoRes.statusCode);

      const [undoneGrant] = await testDb
        .select()
        .from(matchingGrant)
        .where(
          and(
            eq(matchingGrant.schemeId, KANO_SCHEME_ID),
            eq(matchingGrant.purpose, 'Canal lining upgrade'),
            isNull(matchingGrant.deletedAt),
          ),
        );
      expect(undoneGrant).toBeUndefined();
    });

    it('completes template -> preview -> commit -> undo round trip for me.tech_adoption', async () => {
      const batch = await uploadAndValidate(
        'me.tech_adoption',
        [
          {
            schemeCode: 'KRIS',
            technologyCode: 'drip_irrigation',
            gender: 'female',
            adoptedOn: '2026-06-15',
          },
        ],
        nationalToken,
      );
      expect(batch.status).toBe('validated');
      expect(batch.validRows).toBe(1);
      expect(batch.errorRows).toBe(0);

      // Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(previewRes.statusCode).toBe(200);

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(commitRes.statusCode);

      // Verify row exists in DB with status submitted and importBatchId
      const [importedAdoption] = await testDb
        .select()
        .from(techAdoption)
        .where(
          and(
            eq(techAdoption.schemeId, KANO_SCHEME_ID),
            eq(techAdoption.importBatchId, batch.id),
            isNull(techAdoption.deletedAt),
          ),
        );
      expect(importedAdoption).toBeDefined();
      expect(importedAdoption.gender).toBe('female');
      expect(importedAdoption.status).toBe('submitted');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect([200, 201]).toContain(undoRes.statusCode);

      const [undoneAdoption] = await testDb
        .select()
        .from(techAdoption)
        .where(
          and(
            eq(techAdoption.schemeId, KANO_SCHEME_ID),
            eq(techAdoption.importBatchId, batch.id),
            isNull(techAdoption.deletedAt),
          ),
        );
      expect(undoneAdoption).toBeUndefined();
    });
  });

  describe('Indicator 12, 13, and 16 Data Verification (BE-3.5 Done Gate)', () => {
    it('verifies indicators 12, 13 (tech adoption distinct farmers by gender) and 16 (published scorecards) end-to-end via API', async () => {
      // Seed dedicated test organisations for clean hand count
      const indTestSchemeA = crypto.randomUUID();
      const indTestSchemeB = crypto.randomUUID();
      const indTestSchemeC = crypto.randomUUID();

      await testDb.insert(organisation).values([
        {
          id: indTestSchemeA,
          code: 'IND-A',
          name: 'Indicator Test Scheme A',
          type: 'scheme',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: indTestSchemeB,
          code: 'IND-B',
          name: 'Indicator Test Scheme B',
          type: 'scheme',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: indTestSchemeC,
          code: 'IND-C',
          name: 'Indicator Test Scheme C',
          type: 'scheme',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      await testDb.insert(organisationState).values([
        { organisationId: indTestSchemeA, stateId: KANO_STATE_ID },
        { organisationId: indTestSchemeB, stateId: KANO_STATE_ID },
        { organisationId: indTestSchemeC, stateId: KANO_STATE_ID },
      ]);

      // 1. Create Scorecards via API:
      // Scheme A: published
      const scARes = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          schemeId: indTestSchemeA,
          periodYear: 2026,
          fileId: TEST_FILE_ID,
          publishedOn: '2026-06-30',
        },
      });
      expect(scARes.statusCode).toBe(201);

      // Scheme B: unpublished (publishedOn omitted/null)
      const scBRes = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          schemeId: indTestSchemeB,
          periodYear: 2026,
          fileId: TEST_FILE_ID,
        },
      });
      expect(scBRes.statusCode).toBe(201);

      // Scheme C: published
      const scCRes = await app.inject({
        method: 'POST',
        url: '/me/scorecards',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          schemeId: indTestSchemeC,
          periodYear: 2026,
          fileId: TEST_FILE_ID,
          publishedOn: '2026-07-31',
        },
      });
      expect(scCRes.statusCode).toBe(201);

      // 2. Create Tech Adoption records via API and Sync Push:
      const farmerF1 = crypto.randomUUID();
      const farmerF2 = crypto.randomUUID();
      const farmerM1 = crypto.randomUUID();
      const farmerF3 = crypto.randomUUID();
      const farmerM2 = crypto.randomUUID();

      // F1 adoption 1 (via API by kanoOfficer)
      const resF1a = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerF1,
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-05-01',
        },
      });
      expect(resF1a.statusCode).toBe(201);
      const idF1a = resF1a.json().id;

      // F1 adoption 2 (via API by kanoOfficer)
      const resF1b = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerF1,
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-06-01',
        },
      });
      expect(resF1b.statusCode).toBe(201);
      const idF1b = resF1b.json().id;

      // F2 adoption 1 (via API by kanoOfficer)
      const resF2 = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerF2,
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-05-15',
        },
      });
      expect(resF2.statusCode).toBe(201);
      const idF2 = resF2.json().id;

      // M1 adoption 1 (via Sync Push by field officer)
      const idM1 = crypto.randomUUID();
      const pushRes = await app.inject({
        method: 'POST',
        url: '/slis/sync/push',
        headers: { authorization: `Bearer ${kanoFieldOfficerToken}` },
        payload: {
          deviceId: KANO_FIELD_DEVICE_ID,
          ops: [
            {
              opId: crypto.randomUUID(),
              entity: 'tech_adoption',
              recordId: idM1,
              action: 'create',
              baseVersion: 1,
              data: {
                schemeId: KANO_SCHEME_ID,
                farmerId: farmerM1,
                technologyId: TEST_TECH_ID,
                gender: 'male',
                adoptedOn: '2026-05-20',
              },
            },
          ],
        },
      });
      expect([200, 201]).toContain(pushRes.statusCode);

      // F3 adoption 1 (via API by kanoOfficer - NOT approved)
      const resF3 = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerF3,
          technologyId: TEST_TECH_ID,
          gender: 'female',
          adoptedOn: '2026-05-25',
        },
      });
      expect(resF3.statusCode).toBe(201);

      // M2 adoption 1 (via API by kanoOfficer - NOT approved)
      const resM2 = await app.inject({
        method: 'POST',
        url: '/me/tech-adoption',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          farmerId: farmerM2,
          technologyId: TEST_TECH_ID,
          gender: 'male',
          adoptedOn: '2026-05-30',
        },
      });
      expect(resM2.statusCode).toBe(201);

      // 3. Approve F1 (both records), F2, and M1 via API with an approver in scope
      // Kano state officer approves (submitted by kanoOfficer/fieldOfficer, so separation of duties is satisfied)
      for (const recId of [idF1a, idF1b, idF2, idM1]) {
        const approveRes = await app.inject({
          method: 'POST',
          url: `/me/tech-adoption/${recId}/approve`,
          headers: { authorization: `Bearer ${kanoStateOfficerToken}` },
          payload: { version: 1 },
        });
        expect(approveRes.statusCode).toBe(200);
        expect(approveRes.json().status).toBe('approved');
      }

      // 4. Verify Indicator 12: Distinct farmers adopting technology in Kano scheme
      // Only approved records must be counted (F1, F2, M1 = 3); unapproved (F3, M2) are excluded
      const [ind12Res] = await testDb
        .select({
          totalFarmers: sql<number>`count(distinct ${techAdoption.farmerId})::int`,
        })
        .from(techAdoption)
        .where(
          and(
            eq(techAdoption.schemeId, KANO_SCHEME_ID),
            eq(techAdoption.status, 'approved'),
            isNull(techAdoption.deletedAt),
          ),
        );

      expect(ind12Res.totalFarmers).toBe(3); // farmerF1, farmerF2, farmerM1

      // 5. Verify Indicator 13: Distinct female farmers adopting technology in Kano scheme
      // Only approved female records must be counted (F1, F2 = 2); unapproved female (F3) is excluded
      const [ind13Res] = await testDb
        .select({
          femaleFarmers: sql<number>`count(distinct ${techAdoption.farmerId})::int`,
        })
        .from(techAdoption)
        .where(
          and(
            eq(techAdoption.schemeId, KANO_SCHEME_ID),
            eq(techAdoption.gender, 'female'),
            eq(techAdoption.status, 'approved'),
            isNull(techAdoption.deletedAt),
          ),
        );

      expect(ind13Res.femaleFarmers).toBe(2); // farmerF1, farmerF2

      // 6. Verify Indicator 16: Schemes with published scorecard
      // Out of Scheme A, B, and C, only A and C have published scorecards
      const [ind16Res] = await testDb
        .select({
          schemesWithScorecard: sql<number>`count(distinct ${scorecard.schemeId})::int`,
        })
        .from(scorecard)
        .where(
          and(
            sql`${scorecard.schemeId} IN (${indTestSchemeA}, ${indTestSchemeB}, ${indTestSchemeC})`,
            sql`${scorecard.publishedOn} IS NOT NULL`,
            isNull(scorecard.deletedAt),
          ),
        );

      expect(ind16Res.schemesWithScorecard).toBe(2); // indTestSchemeA and indTestSchemeC
    });
  });
});
