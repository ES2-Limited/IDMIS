import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { permissions } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  organisation,
  lookupType,
  lookupValue,
  basin,
  dam,
  damSafetyInspection,
  station,
  outboxEvent,
  mvDamStatus,
  postgres,
  db,
  setDatabaseUrl,
  eq,
  and,
  sql,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { ProblemDetailsFilter } from '../../platform/filters/problem-details.filter';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { BlisComputeQueryService } from './services/blis-compute-query.service';
import { DamInspectionRepository } from './repositories/dam-inspection.repository';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BLIS Dam Safety Inspections, Condition Ratings & Indicators 5/7 (BE-4.4)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let computeQueryService: BlisComputeQueryService;
  let damInspectionRepo: DamInspectionRepository;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: typeof db;

  const TEST_DB_NAME = `idmis_test_blis_insp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Users
  const SYSTEM_USER_ID = crypto.randomUUID();
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const INSPECTOR_A_ID = crypto.randomUUID();
  const APPROVER_B_ID = crypto.randomUUID();
  const CHAD_OFFICER_ID = crypto.randomUUID();

  // Roles
  const NATIONAL_ROLE_ID = crypto.randomUUID();
  const INSPECTOR_ROLE_ID = crypto.randomUUID();
  const APPROVER_ROLE_ID = crypto.randomUUID();

  // RBDAs
  const HJ_RBDA_ID = crypto.randomUUID();
  const CHAD_RBDA_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();

  // Basins
  const HJ_BASIN_ID = crypto.randomUUID();
  const CHAD_BASIN_ID = crypto.randomUUID();

  // Dams
  const TIGA_DAM_ID = crypto.randomUUID();
  const CHAD_DAM_ID = crypto.randomUUID();

  // Rating lookups
  let ratingGoodId: string;
  let ratingFairId: string;
  let ratingPoorId: string;
  let ratingCriticalId: string;

  // Hazard class lookup
  let hazardHighId: string;

  // Station type lookup
  let stDischargeId: string;

  // Tokens
  let nationalToken: string;
  let inspectorAToken: string;
  let approverBToken: string;
  let chadOfficerToken: string;

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;

    // Apply migrations
    const { migrate } = await import('@idmis/db');
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    // 2. Initialize Nest Application
    const adapter = new FastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: ['error', 'warn'],
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
    computeQueryService = app.get(BlisComputeQueryService);
    damInspectionRepo = app.get(DamInspectionRepository);

    // 3. Seed Users
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
        id: INSPECTOR_A_ID,
        email: 'inspector.a@idmis.gov.ng',
        fullName: 'Inspector A',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: APPROVER_B_ID,
        email: 'approver.b@idmis.gov.ng',
        fullName: 'Approver B',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_OFFICER_ID,
        email: 'chad.officer@idmis.gov.ng',
        fullName: 'Chad Basin Officer',
        passwordHash: 'dummy',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 4. Seed RBDAs in core.organisation
    await testDb.insert(organisation).values([
      {
        id: HJ_RBDA_ID,
        code: 'HJRBDA',
        name: 'Hadejia-Jamaare River Basin Development Authority',
        type: 'rbda',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_RBDA_ID,
        code: 'CHADRBDA',
        name: 'Chad Basin Development Authority',
        type: 'rbda',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 5. Seed Roles & Permissions
    await testDb.insert(role).values([
      {
        id: NATIONAL_ROLE_ID,
        key: 'national_admin',
        name: 'National Admin',
        isSystem: false,
      },
      {
        id: INSPECTOR_ROLE_ID,
        key: 'dam_inspector',
        name: 'Dam Inspector',
        isSystem: false,
      },
      {
        id: APPROVER_ROLE_ID,
        key: 'dam_approver',
        name: 'Dam Approver',
        isSystem: false,
      },
    ]);

    const inspectorPerms = [
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_DAM_MANAGE,
      permissions.BLIS_INSPECTION_RECORD,
    ];
    const approverPerms = [
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_DAM_MANAGE,
      permissions.BLIS_INSPECTION_RECORD,
      permissions.BLIS_INSPECTION_APPROVE,
    ];
    const nationalPerms = [
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_BASIN_MANAGE,
      permissions.BLIS_DAM_MANAGE,
      permissions.BLIS_INSPECTION_RECORD,
      permissions.BLIS_INSPECTION_APPROVE,
    ];

    await testDb
      .insert(rolePermission)
      .values([
        ...nationalPerms.map((p) => ({ roleId: NATIONAL_ROLE_ID, permission: p })),
        ...inspectorPerms.map((p) => ({ roleId: INSPECTOR_ROLE_ID, permission: p })),
        ...approverPerms.map((p) => ({ roleId: APPROVER_ROLE_ID, permission: p })),
      ]);

    // 6. User Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: NATIONAL_ADMIN_ID,
        roleId: NATIONAL_ROLE_ID,
        module: 'blis',
        scopeType: 'national',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: INSPECTOR_A_ID,
        roleId: INSPECTOR_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: APPROVER_B_ID,
        roleId: APPROVER_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: CHAD_OFFICER_ID,
        roleId: INSPECTOR_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: CHAD_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 7. Seed Lookups
    const [ltRating] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'component_rating',
        name: 'Component Rating',
        module: 'blis',
      })
      .returning();

    ratingGoodId = crypto.randomUUID();
    ratingFairId = crypto.randomUUID();
    ratingPoorId = crypto.randomUUID();
    ratingCriticalId = crypto.randomUUID();

    await testDb.insert(lookupValue).values([
      { id: ratingGoodId, lookupTypeId: ltRating.id, code: 'good', label: 'Good', sortOrder: 1 },
      { id: ratingFairId, lookupTypeId: ltRating.id, code: 'fair', label: 'Fair', sortOrder: 2 },
      { id: ratingPoorId, lookupTypeId: ltRating.id, code: 'poor', label: 'Poor', sortOrder: 3 },
      {
        id: ratingCriticalId,
        lookupTypeId: ltRating.id,
        code: 'critical',
        label: 'Critical',
        sortOrder: 4,
      },
    ]);

    const [ltHazard] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'hazard_class',
        name: 'Hazard Class',
        module: 'blis',
      })
      .returning();

    hazardHighId = crypto.randomUUID();
    await testDb.insert(lookupValue).values([
      {
        id: hazardHighId,
        lookupTypeId: ltHazard.id,
        code: 'high',
        label: 'High Hazard',
        sortOrder: 1,
      },
    ]);

    const [ltStationType] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'station_type',
        name: 'Station Type',
        module: 'blis',
      })
      .returning();

    stDischargeId = crypto.randomUUID();
    await testDb.insert(lookupValue).values([
      {
        id: stDischargeId,
        lookupTypeId: ltStationType.id,
        code: 'discharge',
        label: 'Discharge',
        sortOrder: 1,
      },
    ]);

    // 8. Seed Basins
    await testDb.insert(basin).values([
      {
        id: HJ_BASIN_ID,
        code: 'HJB-01',
        name: 'Hadejia Basin',
        rbdaId: HJ_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_BASIN_ID,
        code: 'CB-01',
        name: 'Lake Chad Basin',
        rbdaId: CHAD_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 9. Seed Dams
    await testDb.insert(dam).values([
      {
        id: TIGA_DAM_ID,
        code: 'DAM-TIGA',
        name: 'Tiga Dam',
        basinId: HJ_BASIN_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_DAM_ID,
        code: 'DAM-ALAU',
        name: 'Alau Dam',
        basinId: CHAD_BASIN_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 10. Generate Tokens
    async function createSessionToken(userId: string): Promise<string> {
      const sessionId = crypto.randomUUID();
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await testDb.insert(session).values({
        id: sessionId,
        familyId,
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt,
        createdAt: now,
      });
      const { accessToken } = await tokenService.createAccessToken(userId, sessionId);
      return accessToken;
    }

    nationalToken = await createSessionToken(NATIONAL_ADMIN_ID);
    inspectorAToken = await createSessionToken(INSPECTOR_A_ID);
    approverBToken = await createSessionToken(APPROVER_B_ID);
    chadOfficerToken = await createSessionToken(CHAD_OFFICER_ID);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  describe('1. meets_standard rule & client override prevention', () => {
    it('creates inspection with dam_body and spillway_1 good -> meets_standard evaluates to true', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-15',
          nextDueOn: '2027-03-15',
          hazardClassId: hazardHighId,
          staffOnSite: 5,
          components: [
            { component: 'dam_body', ratingId: ratingGoodId, notes: 'Solid condition' },
            { component: 'spillway_1', ratingId: ratingGoodId, notes: 'Clear flow' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.damId).toBe(TIGA_DAM_ID);
      expect(body.status).toBe('submitted');
      expect(body.submittedBy).toBe(INSPECTOR_A_ID);
      expect(body.meetsStandard).toBe(true);
    });

    it('creates inspection with one poor component -> meets_standard evaluates to false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-16',
          components: [
            { component: 'dam_body', ratingId: ratingGoodId },
            { component: 'spillway_1', ratingId: ratingPoorId },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.meetsStandard).toBe(false);
    });

    it('creates inspection missing spillway_1 -> meets_standard evaluates to false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-17',
          components: [
            { component: 'dam_body', ratingId: ratingGoodId },
            { component: 'inlet', ratingId: ratingGoodId },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.meetsStandard).toBe(false);
    });

    it('ignores client-sent meets_standard: true when component conditions fail', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-18',
          meetsStandard: true, // Attempted client-side spoof
          components: [
            { component: 'dam_body', ratingId: ratingCriticalId },
            { component: 'spillway_1', ratingId: ratingGoodId },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.meetsStandard).toBe(false);
    });
  });

  describe('2. Scope Enforcement', () => {
    it('denies Chad officer from inspecting HJ RBDA dam (returns 404)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${chadOfficerToken}` },
        payload: {
          damId: TIGA_DAM_ID, // Tiga belongs to HJ RBDA
          inspectedOn: '2026-03-19',
          components: [
            { component: 'dam_body', ratingId: ratingGoodId },
            { component: 'spillway_1', ratingId: ratingGoodId },
          ],
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('denies Chad officer from viewing HJ RBDA inspection (returns 404)', async () => {
      // Create inspection as Inspector A in HJ RBDA
      const createRes = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-20',
          components: [
            { component: 'dam_body', ratingId: ratingGoodId },
            { component: 'spillway_1', ratingId: ratingGoodId },
          ],
        },
      });
      const inspectionId = createRes.json().id;

      // Chad officer attempts to get inspection
      const getRes = await app.inject({
        method: 'GET',
        url: `/blis/dam-inspections/${inspectionId}`,
        headers: { authorization: `Bearer ${chadOfficerToken}` },
      });

      expect(getRes.statusCode).toBe(404);
    });

    it('allows National Admin to list inspections across all basins', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${nationalToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
    });
  });

  describe('3. Review Lifecycle, Self-Approval Block & Modification Lock', () => {
    let inspectionId: string;
    let inspectionVersion: number;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-03-21',
          nextDueOn: '2027-03-21',
          hazardClassId: hazardHighId,
          safetyBudgetNgn: '50000000.00',
          components: [
            { component: 'dam_body', ratingId: ratingGoodId },
            { component: 'spillway_1', ratingId: ratingGoodId },
            { component: 'outlet', ratingId: ratingFairId },
          ],
        },
      });
      const data = res.json();
      inspectionId = data.id;
      inspectionVersion = data.version;
    });

    it('blocks self-approval by submitter with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspectionId}/approve?version=${inspectionVersion}`,
        headers: { authorization: `Bearer ${inspectorAToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns inspection requires a comment (empty comment -> 400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspectionId}/return?version=${inspectionVersion}`,
        headers: { authorization: `Bearer ${approverBToken}` },
        payload: { comment: '   ' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns inspection with valid comment -> status becomes returned', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspectionId}/return?version=${inspectionVersion}`,
        headers: { authorization: `Bearer ${approverBToken}` },
        payload: { comment: 'Please recheck outlet valve calibration' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('returned');
      expect(data.returnedBy).toBe(APPROVER_B_ID);
      expect(data.returnComment).toBe('Please recheck outlet valve calibration');
      inspectionVersion = data.version;
    });

    it('resubmits inspection via patch -> status becomes submitted again', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/blis/dam-inspections/${inspectionId}`,
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          version: inspectionVersion,
          specificHazards: 'Minor cavitation near outlet',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('submitted');
      expect(data.submittedBy).toBe(INSPECTOR_A_ID);
      expect(data.returnComment).toBeNull();
      inspectionVersion = data.version;
    });

    it('second authorized user approves -> status becomes approved and emits blis.dam.inspected', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspectionId}/approve?version=${inspectionVersion}`,
        headers: { authorization: `Bearer ${approverBToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('approved');
      expect(data.approvedBy).toBe(APPROVER_B_ID);
      expect(data.approvedAt).toBeDefined();
      inspectionVersion = data.version;

      // Verify outbox event
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.eventType, 'blis.dam.inspected'),
            eq(outboxEvent.aggregateId, TIGA_DAM_ID),
          ),
        );
      expect(events.length).toBeGreaterThan(0);
      const payload = events[events.length - 1].payload as Record<string, unknown>;
      expect(payload.damId).toBe(TIGA_DAM_ID);
      expect(payload.inspectionId).toBe(inspectionId);
      expect(payload.meetsStandard).toBe(true);
    });

    it('locks approved inspection against direct modification (returns 400)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/blis/dam-inspections/${inspectionId}`,
        headers: { authorization: `Bearer ${inspectorAToken}` },
        payload: {
          version: inspectionVersion,
          safetyContact: 'Engr Musa',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('4. Materialised View blis.mv_dam_status', () => {
    it('materialised view reflects the latest approved inspection for Tiga Dam', async () => {
      const [statusRow] = await testDb
        .select()
        .from(mvDamStatus)
        .where(eq(mvDamStatus.damId, TIGA_DAM_ID));

      expect(statusRow).toBeDefined();
      expect(statusRow.damId).toBe(TIGA_DAM_ID);
      expect(statusRow.meetsStandard).toBe(true);
      expect(statusRow.inspectedOn).toBe('2026-03-21');
    });

    it('an inspection with next_due_on yesterday shows overdue without any refresh', async () => {
      const yesterday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Lagos',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(Date.now() - 86400000));

      const overdueDamId = crypto.randomUUID();
      const overdueInspId = crypto.randomUUID();
      const now = new Date().toISOString();

      await testDb.insert(dam).values({
        id: overdueDamId,
        code: 'DAM-OVERDUE-01',
        name: 'Overdue Test Dam',
        basinId: HJ_BASIN_ID,
        geom: 'SRID=4326;POINT(8.6 11.5)',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(damSafetyInspection).values({
        id: overdueInspId,
        damId: overdueDamId,
        inspectedOn: '2025-01-01',
        meetsStandard: false,
        nextDueOn: yesterday,
        status: 'approved',
        submittedAt: now,
        submittedBy: SYSTEM_USER_ID,
        approvedAt: now,
        approvedBy: SYSTEM_USER_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      });

      // Refresh materialized view once to record the inspection
      await damInspectionRepo.refreshMvDamStatus(testDb);

      // Verify that reading the status computes isOverdue dynamically live against Africa/Lagos
      const status = await damInspectionRepo.getLatestDamStatus(overdueDamId, testDb);
      expect(status).not.toBeNull();
      expect(status!.damId).toBe(overdueDamId);
      expect(status!.nextDueOn).toBe(yesterday);
      expect(status!.isOverdue).toBe(true);

      // Also verify via raw SQL select that dynamic evaluation computes isOverdue without any refresh
      const [rawRow] = await testDb
        .select({
          damId: mvDamStatus.damId,
          nextDueOn: mvDamStatus.nextDueOn,
          isOverdue: sql<boolean>`COALESCE(${mvDamStatus.nextDueOn} < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date, false)`,
        })
        .from(mvDamStatus)
        .where(eq(mvDamStatus.damId, overdueDamId));

      expect(rawRow.isOverdue).toBe(true);
    });
  });

  describe('5. Indicators 5 & 7 Compute Queries', () => {
    it('Indicator 5: getDamsSafe counts dams whose latest approved inspection meets standard', async () => {
      // Period end before inspection -> 0
      const resPast = await computeQueryService.getDamsSafe('2025-12-31', {
        scopeType: 'national',
      });
      expect(resPast.total).toBe('0');
      expect(resPast.status).toBe('computed');

      // Period end after approval -> 1 (Tiga Dam is approved and meets standard)
      const resNational = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'national',
      });
      expect(resNational.total).toBe('1');
      expect(resNational.status).toBe('computed');

      const resHj = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
      });
      expect(resHj.total).toBe('1');

      const resChad = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'rbda',
        scopeOrgId: CHAD_RBDA_ID,
      });
      expect(resChad.total).toBe('0'); // Chad dam has no approved inspection
    });

    it('Indicator 5: getDamsSafe returns not_available for scheme and sector scope', async () => {
      const resScheme = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
      });
      expect(resScheme.status).toBe('not_available');
      expect(resScheme.total).toBeNull();
      expect(resScheme.message).toBe('not applicable at scheme level');

      const resSector = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'sector',
        scopeOrgId: crypto.randomUUID(),
      });
      expect(resSector.status).toBe('not_available');
      expect(resSector.total).toBeNull();
      expect(resSector.message).toBe('not applicable at scheme level');
    });

    it('Indicator 7: getRiversGauged counts distinct rivers for active discharge stations', async () => {
      const now = new Date().toISOString();
      // Insert discharge stations
      await testDb.insert(station).values([
        {
          id: crypto.randomUUID(),
          code: 'ST-KANO-R1',
          name: 'Hadejia River Gauge 1',
          basinId: HJ_BASIN_ID,
          stationTypeId: stDischargeId,
          river: 'Hadejia River',
          installedOn: '2025-01-15',
          isActive: true,
          geom: 'SRID=4326;POINT(8.5 12.0)',
          createdAt: now,
          createdBy: SYSTEM_USER_ID,
          updatedAt: now,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          code: 'ST-KANO-R2',
          name: 'Hadejia River Gauge 2',
          basinId: HJ_BASIN_ID,
          stationTypeId: stDischargeId,
          river: '  HADEJIA RIVER  ', // Case and whitespace test: should be deduplicated
          installedOn: '2025-06-20',
          isActive: true,
          geom: 'SRID=4326;POINT(8.6 12.1)',
          createdAt: now,
          createdBy: SYSTEM_USER_ID,
          updatedAt: now,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          code: 'ST-KANO-R3',
          name: 'Challawa River Gauge',
          basinId: HJ_BASIN_ID,
          stationTypeId: stDischargeId,
          river: 'Challawa River',
          installedOn: '2025-03-10',
          isActive: true,
          geom: 'SRID=4326;POINT(8.4 11.9)',
          createdAt: now,
          createdBy: SYSTEM_USER_ID,
          updatedAt: now,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          code: 'ST-KANO-INACTIVE',
          name: 'Inactive Gauge',
          basinId: HJ_BASIN_ID,
          stationTypeId: stDischargeId,
          river: 'Jamaare River',
          installedOn: '2025-01-01',
          isActive: false, // Inactive: should NOT be counted
          geom: 'SRID=4326;POINT(9.0 12.0)',
          createdAt: now,
          createdBy: SYSTEM_USER_ID,
          updatedAt: now,
          updatedBy: SYSTEM_USER_ID,
        },
      ]);

      const resNational = await computeQueryService.getRiversGauged('2026-03-31', {
        scopeType: 'national',
      });
      // 2 distinct rivers: 'hadejia river' and 'challawa river'
      expect(resNational.total).toBe('2');

      const resHj = await computeQueryService.getRiversGauged('2026-03-31', {
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
      });
      expect(resHj.total).toBe('2');

      const resChad = await computeQueryService.getRiversGauged('2026-03-31', {
        scopeType: 'rbda',
        scopeOrgId: CHAD_RBDA_ID,
      });
      expect(resChad.total).toBe('0');
    });

    it('Indicator 7: getRiversGauged returns not_available for scheme and sector scope', async () => {
      const resScheme = await computeQueryService.getRiversGauged('2026-03-31', {
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
      });
      expect(resScheme.status).toBe('not_available');
      expect(resScheme.total).toBeNull();
      expect(resScheme.message).toBe('not applicable at scheme level');

      const resSector = await computeQueryService.getRiversGauged('2026-03-31', {
        scopeType: 'sector',
        scopeOrgId: crypto.randomUUID(),
      });
      expect(resSector.status).toBe('not_available');
      expect(resSector.total).toBeNull();
      expect(resSector.message).toBe('not applicable at scheme level');
    });
  });
});
