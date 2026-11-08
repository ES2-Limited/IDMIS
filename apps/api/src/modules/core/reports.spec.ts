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
  session,
  reportJob,
  file,
  auditLog,
  organisation,
  organisationState,
  state,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { AuthzService } from '../../platform/auth/authz.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';

describe('PDF Reports API Endpoints (BE-5.2)', () => {
  const TEST_DB_NAME = `idmis_reports_api_test_${Date.now()}`;
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
  let authzService: AuthzService;

  const SYSTEM_USER_ID = '00000000-0000-7000-8000-000000000001';
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const LAGOS_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const LAGOS_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';

  let nationalUserToken: string;
  let nationalUserId: string;

  let kanoUserToken: string;
  let kanoUserId: string;

  let otherUserToken: string;
  let otherUserId: string;

  let noPermUserToken: string;
  let noPermUserId: string;

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    // Run migrations
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    // Bootstrap Nest Fastify App
    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
    authzService = app.get(AuthzService);

    const dummyHash = await argon2.hash('TestPass123!');

    // 1. Seed system user & states & schemes
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.gov.ng',
      fullName: 'System User',
      passwordHash: dummyHash,
      isActive: true,
    });

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
        type: 'scheme',
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        type: 'scheme',
        code: 'LIS',
        name: 'Lagos Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // 2. Roles
    const reportGenRole = crypto.randomUUID();
    const emptyRole = crypto.randomUUID();

    await testDb.insert(role).values([
      { id: reportGenRole, key: 'report_gen_role', name: 'Report Generator' },
      { id: emptyRole, key: 'empty_role', name: 'Empty Role' },
    ]);

    await testDb.insert(rolePermission).values({
      roleId: reportGenRole,
      permission: permissions.REPORT_GENERATE,
    });

    // 3. Create Users
    // (a) National User
    nationalUserId = crypto.randomUUID();
    const sidNational = crypto.randomUUID();
    await testDb.insert(appUser).values({
      id: nationalUserId,
      email: 'national@test.gov.ng',
      fullName: 'National Officer',
      passwordHash: dummyHash,
      isActive: true,
    });
    await testDb.insert(session).values({
      id: sidNational,
      userId: nationalUserId,
      familyId: crypto.randomUUID(),
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: nationalUserId,
      roleId: reportGenRole,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    nationalUserToken = (await tokenService.createAccessToken(nationalUserId, sidNational))
      .accessToken;

    // (b) Kano Scoped User
    kanoUserId = crypto.randomUUID();
    const sidKano = crypto.randomUUID();
    await testDb.insert(appUser).values({
      id: kanoUserId,
      email: 'kano@test.gov.ng',
      fullName: 'Kano Officer',
      passwordHash: dummyHash,
      isActive: true,
    });
    await testDb.insert(session).values({
      id: sidKano,
      userId: kanoUserId,
      familyId: crypto.randomUUID(),
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: kanoUserId,
      roleId: reportGenRole,
      module: 'core',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    kanoUserToken = (await tokenService.createAccessToken(kanoUserId, sidKano)).accessToken;

    // (c) Other User (for owner-only tests)
    otherUserId = crypto.randomUUID();
    const sidOther = crypto.randomUUID();
    await testDb.insert(appUser).values({
      id: otherUserId,
      email: 'other@test.gov.ng',
      fullName: 'Other Officer',
      passwordHash: dummyHash,
      isActive: true,
    });
    await testDb.insert(session).values({
      id: sidOther,
      userId: otherUserId,
      familyId: crypto.randomUUID(),
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: otherUserId,
      roleId: reportGenRole,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    otherUserToken = (await tokenService.createAccessToken(otherUserId, sidOther)).accessToken;

    // (d) No Perm User
    noPermUserId = crypto.randomUUID();
    const sidNoPerm = crypto.randomUUID();
    await testDb.insert(appUser).values({
      id: noPermUserId,
      email: 'noperm@test.gov.ng',
      fullName: 'No Perm User',
      passwordHash: dummyHash,
      isActive: true,
    });
    await testDb.insert(session).values({
      id: sidNoPerm,
      userId: noPermUserId,
      familyId: crypto.randomUUID(),
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: noPermUserId,
      roleId: emptyRole,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    noPermUserToken = (await tokenService.createAccessToken(noPermUserId, sidNoPerm)).accessToken;

    await authzService.invalidateUser(nationalUserId);
    await authzService.invalidateUser(kanoUserId);
    await authzService.invalidateUser(otherUserId);
    await authzService.invalidateUser(noPermUserId);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await testClient?.end();
      await adminClient?.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient?.end();
    } catch {
      // ignore teardown error
    }
  });

  describe('POST /reports', () => {
    it('returns 202 Accepted and queues report for valid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: { authorization: `Bearer ${nationalUserToken}` },
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
      expect(body.reportId).toBe(body.id);
      expect(body.status).toBe('queued');

      // Verify job was recorded in database
      const [job] = await testDb.select().from(reportJob).where(schema.eq(reportJob.id, body.id));
      expect(job).toBeDefined();
      expect(job.userId).toBe(nationalUserId);
      expect(job.type).toBe('scheme_report');
    });

    it('returns 400 Bad Request when params are invalid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: { authorization: `Bearer ${nationalUserToken}` },
        payload: {
          type: 'scheme_report',
          params: {
            schemeId: 'invalid-uuid-not-valid',
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 403 Forbidden when user lacks REPORT_GENERATE permission', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: { authorization: `Bearer ${noPermUserToken}` },
        payload: {
          type: 'dam_safety_summary',
          params: {},
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 404 when requested scheme is outside user scope', async () => {
      // Kano officer requests Lagos Scheme
      const res = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: { authorization: `Bearer ${kanoUserToken}` },
        payload: {
          type: 'scheme_report',
          params: {
            schemeId: LAGOS_SCHEME_ID,
          },
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /reports/:id', () => {
    it('returns status for queued/pending report', async () => {
      const reportId = crypto.randomUUID();
      await testDb.insert(reportJob).values({
        id: reportId,
        userId: nationalUserId,
        type: 'indicator_matrix',
        params: { scopeType: 'programme' },
        status: 'queued',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${nationalUserToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(reportId);
      expect(body.status).toBe('queued');
      expect(body.downloadUrl).toBeNull();
    });

    it('returns signed download link and records audit when completed', async () => {
      const reportId = crypto.randomUUID();
      const fileId = crypto.randomUUID();

      await testDb.insert(file).values({
        id: fileId,
        storageKey: `reports/${reportId}.pdf`,
        originalName: `${reportId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        sha256: 'mock-sha',
        scanStatus: 'clean',
        createdBy: nationalUserId,
        updatedBy: nationalUserId,
      });

      await testDb.insert(reportJob).values({
        id: reportId,
        userId: nationalUserId,
        type: 'dam_safety_summary',
        params: {},
        status: 'completed',
        fileId,
        completedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'GET',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${nationalUserToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(reportId);
      expect(body.status).toBe('completed');
      expect(body.downloadUrl).toBeDefined();
      expect(body.downloadUrl).toContain('reports');
      expect(body.expiresAt).toBeDefined();

      // Check that expiresAt is ~15 minutes in the future
      const expiry = new Date(body.expiresAt).getTime();
      const now = Date.now();
      expect(expiry - now).toBeGreaterThan(800 * 1000);
      expect(expiry - now).toBeLessThanOrEqual(905 * 1000);

      // Verify audited link issuance
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(schema.eq(auditLog.entityId, reportId));
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0].action).toBe('report.download');
      expect(audits[0].actorUserId).toBe(nationalUserId);
    });

    it('returns 404 when non-owner requests the report (owner-only access)', async () => {
      const reportId = crypto.randomUUID();
      await testDb.insert(reportJob).values({
        id: reportId,
        userId: nationalUserId,
        type: 'dam_safety_summary',
        params: {},
        status: 'completed',
      });

      // User B (otherUser) requests nationalUser's report -> 404 Not Found (NOT 403)
      const res = await app.inject({
        method: 'GET',
        url: `/reports/${reportId}`,
        headers: { authorization: `Bearer ${otherUserToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when report does not exist', async () => {
      const nonexistentId = crypto.randomUUID();
      const res = await app.inject({
        method: 'GET',
        url: `/reports/${nonexistentId}`,
        headers: { authorization: `Bearer ${nationalUserToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
