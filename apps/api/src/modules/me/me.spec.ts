import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import ExcelJS from 'exceljs';
import { permissions, ME_IMPORT_TEMPLATES, type MeImportDataset } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  state,
  organisation,
  organisationState,
  resultsFramework,
  indicator,
  indicatorTarget,
  indicatorValue,
  file,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
  isNull,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

describe('M&E Values, Targets, Approval, Evidence & Imports (BE-3.2)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_me_values_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test User IDs
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const KANO_ME_OFFICER_ID = crypto.randomUUID(); // can submit
  const KANO_ME_APPROVER_ID = crypto.randomUUID(); // can approve
  const LAGOS_ME_OFFICER_ID = crypto.randomUUID(); // out of scope for Kano
  const SYSTEM_USER_ID = crypto.randomUUID();

  // Role IDs
  const ME_NATIONAL_ROLE_ID = crypto.randomUUID();
  const ME_OFFICER_ROLE_ID = crypto.randomUUID();
  const ME_APPROVER_ROLE_ID = crypto.randomUUID();

  // Geography & Scheme IDs
  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();
  const LAGOS_SCHEME_ID = crypto.randomUUID();

  // Results Framework & Indicators
  const FRAMEWORK_ID = crypto.randomUUID();
  const MANUAL_IND_ID = crypto.randomUUID();
  const COMPUTED_IND_ID = crypto.randomUUID();

  // Tokens
  let nationalToken: string;
  let kanoOfficerToken: string;
  let kanoApproverToken: string;
  let lagosOfficerToken: string;

  const mockStorageFiles = new Map<string, Buffer>();

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);

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

    // Mock storageService.getObjectBuffer
    storageService.getObjectBuffer = async (storageKey: string) => {
      const buf = mockStorageFiles.get(storageKey);
      if (!buf) throw new Error(`Mock storage file not found: ${storageKey}`);
      return buf;
    };

    // 3. Seed Users
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$fakeHashfakeHashfakeHashfakeHashfakeHash$fake';
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'System User',
      },
      {
        id: NATIONAL_ADMIN_ID,
        email: 'me.admin@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'National M&E Admin',
      },
      {
        id: KANO_ME_OFFICER_ID,
        email: 'kano.officer@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'Kano M&E Officer',
      },
      {
        id: KANO_ME_APPROVER_ID,
        email: 'kano.approver@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'Kano M&E Approver',
      },
      {
        id: LAGOS_ME_OFFICER_ID,
        email: 'lagos.officer@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'Lagos M&E Officer',
      },
    ]);

    // 4. Seed Geography
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

    // 5. Seed Schemes (Organisations)
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
        code: 'LRIS',
        name: 'Lagos River Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // 6. Seed Results Framework and Indicators
    await testDb.insert(resultsFramework).values({
      id: FRAMEWORK_ID,
      name: 'TRIMING Results Framework 2026',
      version: 'v1.0',
      isCurrent: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(indicator).values([
      {
        id: MANUAL_IND_ID,
        frameworkId: FRAMEWORK_ID,
        code: '1a',
        name: 'Area provided with irrigation services',
        level: 'pdo',
        unit: 'hectares',
        frequency: 'annual',
        method: 'manual',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: COMPUTED_IND_ID,
        frameworkId: FRAMEWORK_ID,
        code: '2b',
        name: 'Fee recovery rate',
        level: 'intermediate',
        unit: 'percentage',
        frequency: 'quarterly',
        method: 'computed',
        computeKey: 'slis.fee_recovery_rate',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 7. Seed Roles & Role Permissions
    await testDb.insert(role).values([
      { id: ME_NATIONAL_ROLE_ID, key: 'me_national_admin', name: 'National M&E Admin' },
      { id: ME_OFFICER_ROLE_ID, key: 'me_officer', name: 'M&E Field Officer' },
      { id: ME_APPROVER_ROLE_ID, key: 'me_approver', name: 'M&E Reviewer/Approver' },
    ]);

    // Permissions: National Admin has all
    const allPerms = Object.values(permissions);
    await testDb
      .insert(rolePermission)
      .values(allPerms.map((p) => ({ roleId: ME_NATIONAL_ROLE_ID, permission: p })));

    // M&E Officer: read, target manage, value submit, file upload, import run
    await testDb.insert(rolePermission).values([
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.ME_INDICATOR_READ },
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.ME_TARGET_MANAGE },
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.ME_VALUE_SUBMIT },
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.CORE_FILE_UPLOAD },
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.CORE_FILE_READ },
      { roleId: ME_OFFICER_ROLE_ID, permission: permissions.CORE_IMPORT_RUN },
    ]);

    // M&E Approver: read, value approve
    await testDb.insert(rolePermission).values([
      { roleId: ME_APPROVER_ROLE_ID, permission: permissions.ME_INDICATOR_READ },
      { roleId: ME_APPROVER_ROLE_ID, permission: permissions.ME_VALUE_APPROVE },
    ]);

    // 8. User Assignments
    // National Admin: national scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: NATIONAL_ADMIN_ID,
      roleId: ME_NATIONAL_ROLE_ID,
      module: 'me',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kano Officer: Kano scheme scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_ME_OFFICER_ID,
      roleId: ME_OFFICER_ROLE_ID,
      module: 'me',
      scopeType: 'scheme',
      scopeOrgId: KANO_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kano Approver: Kano state scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_ME_APPROVER_ID,
      roleId: ME_APPROVER_ROLE_ID,
      module: 'me',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Lagos Officer: Lagos scheme scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: LAGOS_ME_OFFICER_ID,
      roleId: ME_OFFICER_ROLE_ID,
      module: 'me',
      scopeType: 'scheme',
      scopeOrgId: LAGOS_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 9. Generate Tokens
    const makeToken = async (userId: string) => {
      const sid = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sid,
        familyId: crypto.randomUUID(),
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      return (await tokenService.createAccessToken(userId, sid)).accessToken;
    };

    nationalToken = await makeToken(NATIONAL_ADMIN_ID);
    kanoOfficerToken = await makeToken(KANO_ME_OFFICER_ID);
    kanoApproverToken = await makeToken(KANO_ME_APPROVER_ID);
    lagosOfficerToken = await makeToken(LAGOS_ME_OFFICER_ID);
  });

  afterAll(async () => {
    resetAuditWriter();
    if (app) await app.close();
    if (testClient) await testClient.end();
    try {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
    } catch {
      // ignore drop errors
    }
    await adminClient.end();
  }, 20000);

  // Helper to generate a test Excel workbook buffer with embedded template version
  async function createTestWorkbook(
    dataset: MeImportDataset,
    rows: Array<Record<string, unknown>>,
    options?: { templateVersion?: number | null },
  ) {
    const workbook = new ExcelJS.Workbook();
    const version = options?.templateVersion !== undefined ? options.templateVersion : 1;
    if (version !== null) {
      workbook.description = JSON.stringify({ dataset, version });
      workbook.keywords = `templateVersion:${version};dataset:${dataset}`;
      workbook.subject = String(version);
      const metaSheet = workbook.addWorksheet('_metadata');
      metaSheet.state = 'veryHidden';
      metaSheet.getCell('A1').value = 'template_version';
      metaSheet.getCell('B1').value = version;
      metaSheet.getCell('A2').value = 'dataset';
      metaSheet.getCell('B2').value = dataset;
    }

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

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async function uploadAndValidate(
    dataset: MeImportDataset,
    rows: Array<Record<string, unknown>>,
    token: string,
    schemeId?: string,
  ) {
    const buffer = await createTestWorkbook(dataset, rows);
    const fileId = crypto.randomUUID();
    const storageKey = `imports/${fileId}.xlsx`;
    mockStorageFiles.set(storageKey, buffer);

    await testDb.insert(file).values({
      id: fileId,
      storageKey,
      originalName: `${dataset}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      scanStatus: 'clean',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/imports',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        dataset,
        fileId,
        schemeId,
      },
    });
    expect(uploadRes.statusCode).toBe(201);
    const batch = uploadRes.json();

    let validatedBatch = batch;
    for (let i = 0; i < 30; i++) {
      const getRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      validatedBatch = getRes.json();
      if (validatedBatch.status === 'validated' || validatedBatch.status === 'validation_failed') {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    return validatedBatch;
  }

  describe('Indicators (Read)', () => {
    it('lists indicators and retrieves indicator by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/me/indicators',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.length).toBeGreaterThanOrEqual(2);

      const getRes = await app.inject({
        method: 'GET',
        url: `/me/indicators/${MANUAL_IND_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().code).toBe('1a');
    });
  });

  describe('Targets: Slot Rules, Scopes & Version Concurrency', () => {
    let createdTargetId: string;

    it('creates a target for Kano scheme within scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/targets',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          year: 2026,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          value: '12500.50',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBeDefined();
      expect(data.value).toBe('12500.5000');
      expect(data.version).toBe(1);
      createdTargetId = data.id;
    });

    it('rejects duplicate target slot (indicator, year, scope) with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/targets',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          year: 2026,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          value: '13000.00',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('rejects target creation outside assigned scope (403 Forbidden)', async () => {
      // Kano officer trying to create target for Lagos scheme
      const res = await app.inject({
        method: 'POST',
        url: '/me/targets',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          year: 2026,
          scopeType: 'scheme',
          scopeOrgId: LAGOS_SCHEME_ID,
          value: '8000.00',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('rejects target creation with spoofed state for scheme scope and verifies stored state derivation', async () => {
      // 1. Client provides scopeStateId when scopeType is scheme -> 400 Bad Request (contract schema rejection)
      const spoofRes = await app.inject({
        method: 'POST',
        url: '/me/targets',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          year: 2027,
          scopeType: 'scheme',
          scopeOrgId: LAGOS_SCHEME_ID,
          scopeStateId: KANO_STATE_ID, // spoofed Kano state for Lagos scheme!
          value: '8000.00',
        },
      });
      expect(spoofRes.statusCode).toBe(400);

      // Verify nothing written
      const checkRows = await testDb
        .select()
        .from(indicatorTarget)
        .where(
          and(
            eq(indicatorTarget.indicatorId, MANUAL_IND_ID),
            eq(indicatorTarget.year, 2027),
            eq(indicatorTarget.scopeOrgId, LAGOS_SCHEME_ID),
          ),
        );
      expect(checkRows.length).toBe(0);

      // 2. Verify stored target's scope_state_id is derived server-side from organisation_state
      const [storedKanoTarget] = await testDb
        .select()
        .from(indicatorTarget)
        .where(eq(indicatorTarget.id, createdTargetId));
      expect(storedKanoTarget.scopeStateId).toBe(KANO_STATE_ID);
    });

    it('allows national admin to create national target', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/targets',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          year: 2026,
          scopeType: 'national',
          value: '50000.00',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().scopeType).toBe('national');
    });

    it('updates target with optimistic concurrency check', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/me/targets/${createdTargetId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          value: '14000.00',
          version: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().value).toBe('14000.0000');
      expect(res.json().version).toBe(2);

      // Stale update with version 1 fails with 409 Conflict
      const staleRes = await app.inject({
        method: 'PUT',
        url: `/me/targets/${createdTargetId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          value: '15000.00',
          version: 1,
        },
      });
      expect(staleRes.statusCode).toBe(409);
    });
  });

  describe('Values: Slot Rules, Computed Rejection, Workflow & Locking', () => {
    let testValueId: string;

    it('rejects manual writes for computed indicators with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: COMPUTED_IND_ID,
          periodYear: 2026,
          periodQuarter: 1,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          value: '85.5',
        },
      });

      expect([400, 409]).toContain(res.statusCode);
      const body = res.json();
      expect(body.detail || body.message).toContain('computed indicators');
    });

    it('creates an indicator value in draft status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          periodYear: 2026,
          periodQuarter: 1,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          disaggregation: { gender: 'female' },
          value: '3500.00',
          notes: 'Initial field count',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.status).toBe('draft');
      expect(data.version).toBe(1);
      testValueId = data.id;
    });

    it('enforces slot uniqueness for values (409 Conflict on duplicate)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          periodYear: 2026,
          periodQuarter: 1,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          disaggregation: { gender: 'female' },
          value: '3600.00',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('rejects value creation with spoofed state for scheme scope and verifies stored state derivation', async () => {
      // 1. Client provides scopeStateId when scopeType is scheme -> 400 Bad Request
      const spoofRes = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          periodYear: 2026,
          periodQuarter: 2,
          scopeType: 'scheme',
          scopeOrgId: LAGOS_SCHEME_ID,
          scopeStateId: KANO_STATE_ID, // spoofed Kano state for Lagos scheme!
          value: '9000.00',
        },
      });
      expect(spoofRes.statusCode).toBe(400);

      // Verify nothing written
      const checkRows = await testDb
        .select()
        .from(indicatorValue)
        .where(
          and(
            eq(indicatorValue.indicatorId, MANUAL_IND_ID),
            eq(indicatorValue.periodYear, 2026),
            eq(indicatorValue.periodQuarter, 2),
            eq(indicatorValue.scopeOrgId, LAGOS_SCHEME_ID),
          ),
        );
      expect(checkRows.length).toBe(0);

      // 2. Verified stored value's scope_state_id equals Kano state (derived from organisation_state)
      const [storedKanoValue] = await testDb
        .select()
        .from(indicatorValue)
        .where(eq(indicatorValue.id, testValueId));
      expect(storedKanoValue.scopeStateId).toBe(KANO_STATE_ID);
    });

    it('transitions draft value to submitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/submit`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { version: 1 },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('submitted');
      expect(data.submittedBy).toBe(KANO_ME_OFFICER_ID);
      expect(data.version).toBe(2);
    });

    it('enforces no-self-approval rule (403 Forbidden)', async () => {
      // Kano officer attempts to approve their own submission
      const res = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/approve`,
        headers: {
          // Give national admin token pretending officer had approve permission, or let officer try:
          // If officer tries without ME_VALUE_APPROVE, they get 403 (route guard)
          authorization: `Bearer ${kanoOfficerToken}`,
        },
        payload: { version: 2 },
      });

      expect(res.statusCode).toBe(403);

      // Even if a user with approve permission submitted the record:
      // Let's create a value submitted by Kano Approver, and see if Kano Approver can approve it:
      // 1. Temporarily grant ME_VALUE_SUBMIT to Kano Approver
      await testDb.insert(rolePermission).values({
        roleId: ME_APPROVER_ROLE_ID,
        permission: permissions.ME_VALUE_SUBMIT,
      });

      const selfSubmitRes = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoApproverToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          periodYear: 2026,
          periodQuarter: 2,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          value: '4000.00',
          status: 'submitted',
        },
      });
      expect(selfSubmitRes.statusCode).toBe(201);
      const selfSubmittedVal = selfSubmitRes.json();
      expect(selfSubmittedVal.submittedBy).toBe(KANO_ME_APPROVER_ID);

      // Now Kano Approver attempts to approve their own submission -> 403
      const selfApproveRes = await app.inject({
        method: 'POST',
        url: `/me/values/${selfSubmittedVal.id}/approve`,
        headers: { authorization: `Bearer ${kanoApproverToken}` },
        payload: { version: 1 },
      });

      expect(selfApproveRes.statusCode).toBe(403);
      expect(selfApproveRes.json().detail).toContain('Self-approval is forbidden');
    });

    it('requires comment when returning an indicator value (400 Bad Request)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/return`,
        headers: { authorization: `Bearer ${kanoApproverToken}` },
        payload: {
          comment: '   ', // empty whitespace
          version: 2,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('successfully returns indicator value with valid comment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/return`,
        headers: { authorization: `Bearer ${kanoApproverToken}` },
        payload: {
          comment: 'Please verify the female beneficiary count with WUA register',
          version: 2,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe('returned');
      expect(data.returnComment).toBe(
        'Please verify the female beneficiary count with WUA register',
      );
      expect(data.returnedBy).toBe(KANO_ME_APPROVER_ID);
      expect(data.version).toBe(3);
    });

    it('re-submits returned value and approves it by independent reviewer', async () => {
      // Officer updates and re-submits
      const submitRes = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/submit`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { version: 3 },
      });
      expect(submitRes.statusCode).toBe(200);
      expect(submitRes.json().status).toBe('submitted');

      // Approver in Kano state approves
      const approveRes = await app.inject({
        method: 'POST',
        url: `/me/values/${testValueId}/approve`,
        headers: { authorization: `Bearer ${kanoApproverToken}` },
        payload: { version: 4 },
      });

      expect(approveRes.statusCode).toBe(200);
      const approved = approveRes.json();
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(KANO_ME_APPROVER_ID);
      expect(approved.version).toBe(5);
    });

    it('locks approved values; modifying one requires new submission and resets approval', async () => {
      // Modifying approved value
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/me/values/${testValueId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          value: '3800.00',
          version: 5,
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const data = updateRes.json();
      expect(data.status).toBe('submitted');
      expect(data.value).toBe('3800.0000');
      expect(data.approvedBy).toBeNull();
      expect(data.approvedAt).toBeNull();
      expect(data.submittedBy).toBe(KANO_ME_OFFICER_ID);
      expect(data.version).toBe(6);
    });

    it('enforces scope: Lagos officer cannot view or update Kano value (404 Not Found)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/me/values/${testValueId}`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
      });
      expect(res.statusCode).toBe(404);

      const putRes = await app.inject({
        method: 'PUT',
        url: `/me/values/${testValueId}`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
        payload: { value: '9999.00', version: 6 },
      });
      expect(putRes.statusCode).toBe(404);
    });
  });

  describe('Evidence: Attachment, Scoping & Removal', () => {
    let fileId: string;

    beforeAll(async () => {
      // Seed a core.file record
      fileId = crypto.randomUUID();
      await testDb.insert(file).values({
        id: fileId,
        storageKey: `evidence/${fileId}.pdf`,
        originalName: 'survey_summary.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        scanStatus: 'clean',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
    });

    it('attaches evidence to value and updates owner_entity', async () => {
      // Create a value to attach evidence to
      const valRes = await app.inject({
        method: 'POST',
        url: '/me/values',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          indicatorId: MANUAL_IND_ID,
          periodYear: 2026,
          periodQuarter: 3,
          scopeType: 'scheme',
          scopeOrgId: KANO_SCHEME_ID,
          value: '4200.00',
        },
      });
      const val = valRes.json();

      // Attach evidence
      const attachRes = await app.inject({
        method: 'POST',
        url: `/me/values/${val.id}/evidence`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { fileId },
      });

      expect(attachRes.statusCode).toBe(201);
      expect(attachRes.json().fileId).toBe(fileId);

      // Verify owner_entity was set on file
      const [f] = await testDb.select().from(file).where(eq(file.id, fileId)).limit(1);
      expect(f?.ownerEntity).toBe('me.indicator_value');
      expect(f?.ownerId).toBe(val.id);

      // List evidence
      const listRes = await app.inject({
        method: 'GET',
        url: `/me/values/${val.id}/evidence`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().length).toBe(1);
      expect(listRes.json()[0].originalName).toBe('survey_summary.pdf');

      // Scope check: Lagos officer cannot view, attach or delete evidence of Kano value (404)
      const outOfScopeGetRes = await app.inject({
        method: 'GET',
        url: `/me/values/${val.id}/evidence`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
      });
      expect(outOfScopeGetRes.statusCode).toBe(404);

      const outOfScopeAttachRes = await app.inject({
        method: 'POST',
        url: `/me/values/${val.id}/evidence`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
        payload: { fileId },
      });
      expect(outOfScopeAttachRes.statusCode).toBe(404);

      const outOfScopeDeleteRes = await app.inject({
        method: 'DELETE',
        url: `/me/values/${val.id}/evidence/${fileId}`,
        headers: { authorization: `Bearer ${lagosOfficerToken}` },
      });
      expect(outOfScopeDeleteRes.statusCode).toBe(404);

      // Remove evidence
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/me/values/${val.id}/evidence/${fileId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);

      // Verify removal
      const afterList = await app.inject({
        method: 'GET',
        url: `/me/values/${val.id}/evidence`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(afterList.json().length).toBe(0);
    });
  });

  describe('Import Engine: me.indicator_target Round-Trip', () => {
    it('executes full round-trip: template -> fill -> upload -> preview -> commit -> undo', async () => {
      // 1. Template
      const templateRes = await app.inject({
        method: 'GET',
        url: '/imports/template/me.indicator_target',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(templateRes.statusCode).toBe(200);

      // 2. Build workbook & upload
      const rows = [
        {
          indicatorCode: '1a',
          year: 2027,
          scopeType: 'scheme',
          schemeCode: 'KRIS',
          value: '18500.00',
        },
      ];
      const batch = await uploadAndValidate(
        'me.indicator_target',
        rows,
        kanoOfficerToken,
        KANO_SCHEME_ID,
      );
      expect(batch.status).toBe('validated');

      // 3. Preview / Validate
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const previewData = previewRes.json();
      expect(previewData.rows[0].status).toBe('valid');

      // 4. Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);
      expect(commitRes.json().status).toBe('committed');

      // Verify committed target exists
      const [t] = await testDb
        .select()
        .from(indicatorTarget)
        .where(
          and(
            eq(indicatorTarget.indicatorId, MANUAL_IND_ID),
            eq(indicatorTarget.year, 2027),
            isNull(indicatorTarget.deletedAt),
          ),
        );
      expect(t).toBeDefined();
      expect(t?.value).toBe('18500.0000');

      // 5. Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      expect(undoRes.json().status).toBe('undone');

      // Verify target is soft-deleted
      const [tAfter] = await testDb
        .select()
        .from(indicatorTarget)
        .where(
          and(
            eq(indicatorTarget.indicatorId, MANUAL_IND_ID),
            eq(indicatorTarget.year, 2027),
            isNull(indicatorTarget.deletedAt),
          ),
        );
      expect(tAfter).toBeUndefined();
    });
  });

  describe('Import Engine: me.indicator_value Round-Trip', () => {
    it('rejects import of computed indicators during validation', async () => {
      const rows = [
        {
          indicatorCode: '2b', // computed indicator
          periodYear: 2027,
          periodQuarter: 1,
          scopeType: 'scheme',
          schemeCode: 'KRIS',
          value: '75.00',
        },
      ];
      const batch = await uploadAndValidate(
        'me.indicator_value',
        rows,
        kanoOfficerToken,
        KANO_SCHEME_ID,
      );
      expect(batch.status).toBe('validation_failed');

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const previewData = previewRes.json();
      expect(previewData.rows[0].status).toBe('error');
      expect(previewData.rows[0].errors[0].code).toBe('computed_indicator_rejected');
    });

    it('rejects cross-state spoofed scheme rows during value import validation', async () => {
      // Kano officer uploads a row with Lagos scheme ('LRIS') spoofed with Kano state ('KN')
      const rows = [
        {
          indicatorCode: '1a',
          periodYear: 2028,
          periodQuarter: 1,
          scopeType: 'scheme',
          stateCode: 'KN', // spoofed Kano state for Lagos scheme
          schemeCode: 'LRIS', // Lagos Scheme
          disaggregation: JSON.stringify({ gender: 'female' }),
          value: '4500.00',
          notes: 'Attempted cross-state import',
        },
      ];

      const batch = await uploadAndValidate(
        'me.indicator_value',
        rows,
        kanoOfficerToken,
        KANO_SCHEME_ID,
      );

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const previewData = previewRes.json();
      expect(previewData.rows[0].status).toBe('error');
      const err = previewData.rows[0].errors.find(
        (e: { column: string; message: string; code?: string }) => e.code === 'out_of_scope',
      );
      expect(err).toBeDefined();
      expect(err.message).toContain('outside your assigned scope');
    });

    it('executes full round-trip for manual indicator values: template -> fill -> upload -> preview -> commit -> undo', async () => {
      // 1. Template
      const templateRes = await app.inject({
        method: 'GET',
        url: '/imports/template/me.indicator_value',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(templateRes.statusCode).toBe(200);

      // 2. Build workbook with manual indicator (valid)
      const rows = [
        {
          indicatorCode: '1a',
          periodYear: 2027,
          periodQuarter: 1,
          scopeType: 'scheme',
          schemeCode: 'KRIS',
          disaggregation: '{"gender":"female"}',
          value: '4900.00',
          notes: 'Imported value',
        },
      ];
      const batch = await uploadAndValidate(
        'me.indicator_value',
        rows,
        kanoOfficerToken,
        KANO_SCHEME_ID,
      );
      expect(batch.status).toBe('validated');

      // 3. Preview / Validate
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const previewData = previewRes.json();
      expect(previewData.rows[0].status).toBe('valid');

      // 4. Commit valid rows only
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      // Verify committed value is in 'submitted' status with submitted_by = committing user
      const [v] = await testDb
        .select()
        .from(indicatorValue)
        .where(
          and(
            eq(indicatorValue.indicatorId, MANUAL_IND_ID),
            eq(indicatorValue.periodYear, 2027),
            isNull(indicatorValue.deletedAt),
          ),
        );
      expect(v).toBeDefined();
      expect(v?.status).toBe('submitted');
      expect(v?.submittedBy).toBe(KANO_ME_OFFICER_ID);

      // 5. Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      expect(undoRes.json().status).toBe('undone');

      // Verify value is soft deleted
      const [vAfter] = await testDb
        .select()
        .from(indicatorValue)
        .where(
          and(
            eq(indicatorValue.indicatorId, MANUAL_IND_ID),
            eq(indicatorValue.periodYear, 2027),
            isNull(indicatorValue.deletedAt),
          ),
        );
      expect(vAfter).toBeUndefined();
    });
  });
});
