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

describe('SLIS Review Workflow (BE-2.5)', () => {
  const TEST_DB_NAME = `idmis_slis_review_test_${Date.now()}`;
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

  const FIELD_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000010';
  const SCHEME_DATA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000020';
  const KADUNA_APPROVER_ID = '018f3a5e-1000-7000-8000-000000000030';

  const ROLE_FIELD_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000010';
  const ROLE_SCHEME_DATA_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000020';

  let fieldOfficerToken: string;
  let schemeDataOfficerToken: string;
  let kadunaApproverToken: string;

  let testFarmer1Id: string;
  let testFarmer2Id: string;
  let testPlot1Id: string;

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
        id: FIELD_OFFICER_ID,
        email: 'field.officer@example.com',
        fullName: 'Field Collector Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: SCHEME_DATA_OFFICER_ID,
        email: 'data.officer@example.com',
        fullName: 'Scheme Data Approver',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_APPROVER_ID,
        email: 'kaduna.approver@example.com',
        fullName: 'Kaduna Scheme Approver',
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
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KAN-KRA', name: 'Kura' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KAD-CHIK', name: 'Chikun' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KAN-W1', name: 'Kura Central' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KAD-W1', name: 'Chikun South' },
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
        description: 'Reviews, approves, and manages scheme data',
        isSystem: true,
      },
    ]);

    await testDb.insert(rolePermission).values([
      // Field officer: can submit, read, manage farmers and plots, but CANNOT approve
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_FIELD_OFFICER_ID, permission: permissions.SLIS_REVIEW_SUBMIT },

      // Scheme data officer: can approve, return, view review queue, submit
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_PLOT_MANAGE },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_REVIEW_SUBMIT },
      { roleId: ROLE_SCHEME_DATA_OFFICER_ID, permission: permissions.SLIS_REVIEW_APPROVE },
    ]);

    // 5. Assignments
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
        userId: KADUNA_APPROVER_ID,
        roleId: ROLE_SCHEME_DATA_OFFICER_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KADUNA_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Sessions & Tokens
    const sidField = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidField,
      familyId: crypto.randomUUID(),
      userId: FIELD_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    fieldOfficerToken = (await tokenService.createAccessToken(FIELD_OFFICER_ID, sidField))
      .accessToken;

    const sidApprover = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidApprover,
      familyId: crypto.randomUUID(),
      userId: SCHEME_DATA_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    schemeDataOfficerToken = (
      await tokenService.createAccessToken(SCHEME_DATA_OFFICER_ID, sidApprover)
    ).accessToken;

    const sidKaduna = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKaduna,
      familyId: crypto.randomUUID(),
      userId: KADUNA_APPROVER_ID,
      refreshTokenHash: crypto.randomUUID(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kadunaApproverToken = (await tokenService.createAccessToken(KADUNA_APPROVER_ID, sidKaduna))
      .accessToken;

    // Seed draft records
    testFarmer1Id = crypto.randomUUID();
    await testDb.insert(farmer).values({
      id: testFarmer1Id,
      schemeId: KANO_SCHEME_ID,
      sectorId: KANO_SECTOR_ID,
      stateId: KANO_STATE_ID,
      farmerCode: 'REV-FARM-001',
      firstName: 'Hamza',
      lastName: 'Garba',
      gender: 'male',
      status: 'draft',
      createdBy: FIELD_OFFICER_ID,
      updatedBy: FIELD_OFFICER_ID,
    });

    testFarmer2Id = crypto.randomUUID();
    await testDb.insert(farmer).values({
      id: testFarmer2Id,
      schemeId: KANO_SCHEME_ID,
      sectorId: KANO_SECTOR_ID,
      stateId: KANO_STATE_ID,
      farmerCode: 'REV-FARM-002',
      firstName: 'Amina',
      lastName: 'Sani',
      gender: 'female',
      status: 'draft',
      createdBy: FIELD_OFFICER_ID,
      updatedBy: FIELD_OFFICER_ID,
    });

    testPlot1Id = crypto.randomUUID();
    await testDb.insert(plot).values({
      id: testPlot1Id,
      schemeId: KANO_SCHEME_ID,
      sectorId: KANO_SECTOR_ID,
      stateId: KANO_STATE_ID,
      plotCode: 'REV-PLT-001',
      areaHa: '1.7500',
      status: 'draft',
      createdBy: FIELD_OFFICER_ID,
      updatedBy: FIELD_OFFICER_ID,
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

  describe('Submit for Review', () => {
    it('field officer submits draft farmer records for review', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/review/submit/farmer',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          recordIds: [testFarmer1Id, testFarmer2Id],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.submitted).toContain(testFarmer1Id);
      expect(body.submitted).toContain(testFarmer2Id);

      // Verify DB record status and submitted_by
      const [f1] = await testDb.select().from(farmer).where(eq(farmer.id, testFarmer1Id));
      expect(f1?.status).toBe('submitted');
      expect(f1?.submittedBy).toBe(FIELD_OFFICER_ID);
      expect(f1?.submittedAt).toBeDefined();

      // Verify audit log
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityType, 'slis.farmer'));
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    it('submits a draft plot for review', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/review/submit/plot',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          recordIds: [testPlot1Id],
        },
      });

      expect(res.statusCode).toBe(201);
      const [p1] = await testDb.select().from(plot).where(eq(plot.id, testPlot1Id));
      expect(p1?.status).toBe('submitted');
      expect(p1?.submittedBy).toBe(FIELD_OFFICER_ID);
    });

    it('rejects submitting a record that is already submitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/review/submit/farmer',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          recordIds: [testFarmer1Id],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Review Queue', () => {
    it('approver views the review queue and sees submitted items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/review/queue',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(3);

      const farmerItem = body.items.find((i: { id: string }) => i.id === testFarmer1Id);
      expect(farmerItem).toBeDefined();
      expect(farmerItem.entity).toBe('farmer');
      expect(farmerItem.status).toBe('submitted');
      expect(farmerItem.submittedBy).toBe(FIELD_OFFICER_ID);
      expect(farmerItem.submittedByName).toBe('Field Collector Officer');
      expect(farmerItem.summary).toContain('REV-FARM-001');
    });

    it('filters review queue by entity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/review/queue?entity=plot',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.every((i: { entity: string }) => i.entity === 'plot')).toBe(true);
      expect(body.items.some((i: { id: string }) => i.id === testPlot1Id)).toBe(true);
    });

    it('enforces scope isolation on review queue: Kaduna approver cannot see Kano items', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/review/queue',
        headers: { authorization: `Bearer ${kadunaApproverToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.some((i: { id: string }) => i.id === testFarmer1Id)).toBe(false);
    });
  });

  describe('Separation of Duty & Self-Approval Prevention', () => {
    let selfSubmittedFarmerId: string;

    beforeAll(async () => {
      // Create a farmer submitted by the scheme data officer
      selfSubmittedFarmerId = crypto.randomUUID();
      await testDb.insert(farmer).values({
        id: selfSubmittedFarmerId,
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'SELF-FARM-001',
        firstName: 'Self',
        lastName: 'Submitter',
        gender: 'male',
        status: 'submitted',
        submittedBy: SCHEME_DATA_OFFICER_ID,
        submittedAt: new Date().toISOString(),
        createdBy: SCHEME_DATA_OFFICER_ID,
        updatedBy: SCHEME_DATA_OFFICER_ID,
      });
    });

    it('blocks self-approval when approver is the submitter (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${selfSubmittedFarmerId}/approve`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          comment: 'Approving my own submission',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Approvers cannot approve records they submitted');
    });

    it('field officer cannot approve records (403 Forbidden - missing permission)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${testFarmer1Id}/approve`,
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Approve & Return Workflow', () => {
    it('scheme data officer approves submitted farmer, emitting slis.farmer.approved event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${testFarmer1Id}/approve`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          comment: 'Verified documents and identity',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('approved');

      // Verify outbox event
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, testFarmer1Id));
      const approveEvent = events.find((e) => e.eventType === 'slis.farmer.approved');
      expect(approveEvent).toBeDefined();

      // Verify audit
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, testFarmer1Id));
      const approveAudit = audits.find((a) => a.action === 'approve');
      expect(approveAudit).toBeDefined();
    });

    it('scheme data officer returns submitted farmer with required comment, emitting slis.farmer.returned', async () => {
      // Rejects return when comment is missing
      const resNoComment = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${testFarmer2Id}/return`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          comment: '',
        },
      });
      expect([400, 422]).toContain(resNoComment.statusCode);

      // Successfully returns with comment
      const resReturn = await app.inject({
        method: 'POST',
        url: `/slis/review/farmer/${testFarmer2Id}/return`,
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          comment: 'Phone number format is invalid, please update',
        },
      });

      expect(resReturn.statusCode).toBe(201);
      const [f2] = await testDb.select().from(farmer).where(eq(farmer.id, testFarmer2Id));
      expect(f2?.status).toBe('returned');
      expect(f2?.returnedBy).toBe(SCHEME_DATA_OFFICER_ID);
      expect(f2?.returnComment).toBe('Phone number format is invalid, please update');

      // Verify outbox return event
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, testFarmer2Id));
      const returnEvent = events.find((e) => e.eventType === 'slis.farmer.returned');
      expect(returnEvent).toBeDefined();
    });

    it('allows returned record to be resubmitted after updates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/review/submit/farmer',
        headers: { authorization: `Bearer ${fieldOfficerToken}` },
        payload: {
          recordIds: [testFarmer2Id],
        },
      });

      expect(res.statusCode).toBe(201);
      const [f2] = await testDb.select().from(farmer).where(eq(farmer.id, testFarmer2Id));
      expect(f2?.status).toBe('submitted');
    });
  });

  describe('Bulk Approval', () => {
    it('processes bulk approvals with partial failure reporting', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/review/bulk-approve',
        headers: { authorization: `Bearer ${schemeDataOfficerToken}` },
        payload: {
          items: [
            { entity: 'plot', id: testPlot1Id },
            { entity: 'farmer', id: testFarmer2Id },
            { entity: 'farmer', id: crypto.randomUUID() }, // Non-existent
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.succeeded).toContain(testPlot1Id);
      expect(body.succeeded).toContain(testFarmer2Id);
      expect(body.failed.length).toBe(1);
      expect(body.failed[0]?.reason).toContain('not found');

      // Verify plot is approved
      const [p1] = await testDb.select().from(plot).where(eq(plot.id, testPlot1Id));
      expect(p1?.status).toBe('approved');

      // Verify outbox
      const plotEvents = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, testPlot1Id));
      expect(plotEvents.some((e) => e.eventType === 'slis.plot.approved')).toBe(true);
    });
  });
});
