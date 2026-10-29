import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import ExcelJS from 'exceljs';
import { permissions } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  state,
  organisation,
  organisationState,
  ward,
  lga,
  file,
  wua,
  wuaOfficer,
  importBatch,
  importRow,
  outboxEvent,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

describe('Import Engine & WUA Dataset Specification (BE-1.8)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_import_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test Entities
  const ADMIN_USER_ID = crypto.randomUUID();
  const KANO_OFFICER_ID = crypto.randomUUID();
  const SYSTEM_USER_ID = crypto.randomUUID();

  const SYS_ADMIN_ROLE_ID = crypto.randomUUID();
  const FIELD_OFFICER_ROLE_ID = crypto.randomUUID();

  const KANO_STATE_ID = crypto.randomUUID();
  const KADUNA_STATE_ID = crypto.randomUUID();

  const KANO_ORG_ID = crypto.randomUUID();
  const KANO_LGA_ID = crypto.randomUUID();
  const KANO_WARD_ID = crypto.randomUUID();

  let adminToken: string;
  let kanoOfficerToken: string;
  let sharedFileId: string;

  beforeAll(async () => {
    // 1. Create Isolated Test Database
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);

    // Apply DB schema via drizzle migrations
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

    // Mock storageService.getObjectBuffer to return in-memory buffers
    const mockStorageFiles = new Map<string, Buffer>();
    (storageService as unknown as { mockStorageFiles: Map<string, Buffer> }).mockStorageFiles =
      mockStorageFiles;

    storageService.getObjectBuffer = async (storageKey: string) => {
      const buf = mockStorageFiles.get(storageKey);
      if (!buf) throw new Error(`Mock file not found for key: ${storageKey}`);
      return buf;
    };

    // 3. Seed Users
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$fakeHashfakeHashfakeHashfakeHashfakeHash$fake';
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System User',
        passwordHash: dummyHash,
        isActive: true,
      },
      {
        id: ADMIN_USER_ID,
        email: 'admin@idmis.gov.ng',
        fullName: 'Admin User',
        passwordHash: dummyHash,
        isActive: true,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano.officer@idmis.gov.ng',
        fullName: 'Kano Officer',
        passwordHash: dummyHash,
        isActive: true,
      },
    ]);

    // 4. Seed Reference Geography & Organisations
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_STATE_ID,
        code: 'KD',
        name: 'Kaduna State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(lga).values({
      id: KANO_LGA_ID,
      stateId: KANO_STATE_ID,
      code: 'KN-KURA',
      name: 'Kura LGA',
    });

    await testDb.insert(ward).values({
      id: KANO_WARD_ID,
      lgaId: KANO_LGA_ID,
      code: 'KURA-W-01',
      name: 'Kura Central Ward',
    });

    await testDb.insert(organisation).values({
      id: KANO_ORG_ID,
      type: 'scheme',
      code: 'KRIS',
      name: 'Kano River Irrigation Scheme',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(organisationState).values({
      organisationId: KANO_ORG_ID,
      stateId: KANO_STATE_ID,
    });

    // 5. Seed Roles & Permissions
    await testDb.insert(role).values([
      {
        id: SYS_ADMIN_ROLE_ID,
        key: 'system_admin',
        name: 'System Admin',
        isSystem: true,
      },
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: 'field_officer',
        name: 'Field Officer',
        isSystem: true,
      },
    ]);

    // Give system_admin all permissions
    const allPerms = Object.values(permissions);
    await testDb.insert(rolePermission).values(
      allPerms.map((perm) => ({
        roleId: SYS_ADMIN_ROLE_ID,
        permission: perm,
      })),
    );

    // Give field_officer CORE_IMPORT_RUN and CORE_WUA_READ/MANAGE
    await testDb.insert(rolePermission).values([
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_IMPORT_RUN },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_WUA_READ },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_WUA_MANAGE },
    ]);

    // Admin: national scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      roleId: SYS_ADMIN_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kano officer: state scope (Kano)
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'core',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Generate tokens
    const sidAdmin = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidAdmin,
      familyId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const adminAuth = await tokenService.createAccessToken(ADMIN_USER_ID, sidAdmin);
    adminToken = adminAuth.accessToken;

    const sidOfficer = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidOfficer,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const officerAuth = await tokenService.createAccessToken(KANO_OFFICER_ID, sidOfficer);
    kanoOfficerToken = officerAuth.accessToken;

    sharedFileId = crypto.randomUUID();
    await testDb.insert(file).values({
      id: sharedFileId,
      storageKey: `files/${sharedFileId}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 1024,
      sha256: 'f'.repeat(64),
      scanStatus: 'clean',
      createdBy: ADMIN_USER_ID,
      updatedBy: ADMIN_USER_ID,
    });
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
  async function createTestWuaWorkbook(
    rows: Array<Record<string, unknown>>,
    options?: { templateVersion?: number | null; sparseRowCount?: number },
  ) {
    const workbook = new ExcelJS.Workbook();
    const version = options?.templateVersion !== undefined ? options.templateVersion : 1;
    if (version !== null) {
      workbook.description = JSON.stringify({ dataset: 'wua', version });
      workbook.keywords = `templateVersion:${version};dataset:wua`;
      workbook.subject = String(version);
      const metaSheet = workbook.addWorksheet('_metadata');
      metaSheet.state = 'veryHidden';
      metaSheet.getCell('A1').value = 'template_version';
      metaSheet.getCell('B1').value = version;
      metaSheet.getCell('A2').value = 'dataset';
      metaSheet.getCell('B2').value = 'wua';
    }

    const sheet = workbook.addWorksheet('Data');

    sheet.columns = [
      { header: 'WUA Name *', key: 'name' },
      { header: 'Registration Number', key: 'regNo' },
      { header: 'Level *', key: 'level' },
      { header: 'Scheme Code *', key: 'schemeCode' },
      { header: 'Ward Code', key: 'wardCode' },
      { header: 'Address', key: 'address' },
      { header: 'Bank Name', key: 'bankName' },
      { header: 'Account Number', key: 'bankAccountNumber' },
      { header: 'Is Operational', key: 'isOperational' },
      { header: 'Has Maintenance Fund', key: 'hasMaintenanceFund' },
    ];

    for (const r of rows) {
      sheet.addRow(r);
    }

    if (options?.sparseRowCount) {
      sheet.getRow(options.sparseRowCount).getCell(1).value = 'filler';
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // --- 1. Template Generation ---
  describe('GET /imports/template/:dataset', () => {
    it('generates a valid .xlsx template with Data and Instructions sheets', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/imports/template/wua',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const buffer = res.rawPayload;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        buffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
      );

      const dataSheet = workbook.getWorksheet('Data');
      const instructionsSheet = workbook.getWorksheet('Instructions');

      expect(dataSheet).toBeDefined();
      expect(instructionsSheet).toBeDefined();
      expect(dataSheet!.rowCount).toBeGreaterThanOrEqual(1);
    });

    it('rejects unknown dataset template with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/imports/template/unknown_dataset',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- 2. Initiate Import & Scope Security ---
  describe('POST /imports & Scope Security', () => {
    let cleanFileId: string;
    let infectedFileId: string;

    beforeAll(async () => {
      cleanFileId = crypto.randomUUID();
      await testDb.insert(file).values({
        id: cleanFileId,
        storageKey: `files/${cleanFileId}`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 1024,
        sha256: 'a'.repeat(64),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      infectedFileId = crypto.randomUUID();
      await testDb.insert(file).values({
        id: infectedFileId,
        storageKey: `files/${infectedFileId}`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 1024,
        sha256: 'b'.repeat(64),
        scanStatus: 'infected',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });
    });

    it('rejects import if file scan status is not clean (400 Bad Request)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: infectedFileId,
          stateId: KANO_STATE_ID,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toContain("must be 'clean'");
    });

    it('anti-privilege escalation: state officer cannot initiate import for an unscoped state (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          dataset: 'wua',
          fileId: cleanFileId,
          stateId: KADUNA_STATE_ID, // Out of officer's Kano scope
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('creates an import batch and emits outbox event when within scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          dataset: 'wua',
          fileId: cleanFileId,
          stateId: KANO_STATE_ID,
          schemeId: KANO_ORG_ID,
        },
      });

      expect(res.statusCode).toBe(201);
      const batch = JSON.parse(res.body);
      expect(batch.dataset).toBe('wua');
      expect(batch.stateId).toBe(KANO_STATE_ID);

      // Verify outbox event core.import.uploaded was written
      const [ev] = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, batch.id));
      expect(ev).toBeDefined();
      expect(ev.eventType).toBe('core.import.uploaded');
    });
  });

  // --- 3. End-to-End WUA Import Validation, Formula Safety & Preview ---
  describe('WUA Import Validation, Formula Safety & Preview', () => {
    let batchId: string;
    let importFileId: string;

    beforeAll(async () => {
      importFileId = crypto.randomUUID();
      const storageKey = `files/${importFileId}`;

      // Build an Excel file with valid rows, formula injection attempt, and duplicate check
      const excelBuffer = await createTestWuaWorkbook([
        {
          name: 'Kano Unit 1 WUA',
          regNo: 'WUA-KN-101',
          level: 'unit',
          schemeCode: 'KRIS',
          wardCode: 'KURA-W-01',
          address: 'Kura Village',
          bankName: 'Access Bank',
          bankAccountNumber: '0123456789',
          isOperational: true,
          hasMaintenanceFund: true,
        },
        {
          name: '=CMD|/C calc.exe!A1', // Formula injection attempt!
          regNo: '+234800000000', // Formula symbol + prefix
          level: 'sector',
          schemeCode: 'KRIS',
          address: 'Safe address',
          bankName: 'Zenith',
          bankAccountNumber: '9876543210',
          isOperational: 'true',
          hasMaintenanceFund: 'false',
        },
        {
          name: 'Invalid Scheme WUA',
          regNo: 'WUA-ERR-001',
          level: 'unit',
          schemeCode: 'NON_EXISTENT_SCHEME', // Should cause validation error
          isOperational: true,
        },
      ]);

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, excelBuffer);

      await testDb.insert(file).values({
        id: importFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: excelBuffer.length,
        sha256: crypto.createHash('sha256').update(excelBuffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: importFileId,
          stateId: KANO_STATE_ID,
        },
      });

      batchId = JSON.parse(initRes.body).id;

      // Allow background validation to complete
      const importService = app.get((await import('./services/import.service')).ImportService);
      await importService.validateBatch(batchId);
    });

    it('GET /imports/:batchId: returns validation summary and status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const batch = JSON.parse(res.body);
      expect(batch.totalRows).toBe(3);
      expect(batch.validRows).toBe(1);
      expect(batch.errorRows).toBe(2);
      expect(batch.status).toBe('validation_failed');
    });

    it('formula safety: rejects formula cells with a per-cell error without prefixing and storing', async () => {
      const rows = await testDb.select().from(importRow).where(eq(importRow.batchId, batchId));

      const formulaRow = rows.find((r) => r.rowNumber === 3);
      expect(formulaRow).toBeDefined();

      const raw = formulaRow!.rawData as Record<string, unknown>;
      // The formula characters must NOT be prefixed with single quote
      expect(String(raw.name)).toBe('=CMD|/C calc.exe!A1');
      expect(String(raw.regNo)).toBe('+234800000000');

      // The row status must be error, and errors must include FORMULA_FORBIDDEN
      expect(formulaRow!.status).toBe('error');
      const errs = formulaRow!.errors;
      expect(errs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'name', code: 'FORMULA_FORBIDDEN' }),
          expect.objectContaining({ column: 'regNo', code: 'FORMULA_FORBIDDEN' }),
        ]),
      );
    });

    it('GET /imports/:batchId/preview: returns rows with column-level errors', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const preview = JSON.parse(res.body);
      expect(preview.totalRows).toBe(3);
      expect(preview.rows).toHaveLength(3);

      const errRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 4);
      expect(errRow).toBeDefined();
      expect(errRow.errors[0].column).toBe('schemeCode');
      expect(errRow.errors[0].message).toContain('NON_EXISTENT_SCHEME');
    });
  });

  // --- 4. SSE Token & Progress Stream ---
  describe('SSE Token Auth & Streaming', () => {
    let batchId: string;

    beforeAll(async () => {
      const [batch] = await testDb
        .insert(importBatch)
        .values({
          dataset: 'wua',
          fileId: sharedFileId,
          status: 'uploaded',
          stateId: KANO_STATE_ID,
          createdBy: ADMIN_USER_ID,
        })
        .returning();
      batchId = batch!.id;
    });

    it('POST /imports/:batchId/token: generates a 60-second SSE token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/token`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.sseToken).toBeDefined();
      expect(data.expiresInSeconds).toBe(60);
    });

    it('GET /imports/:batchId/progress: rejects invalid or missing token with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/progress?token=bad-token-123`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('GET /imports/:batchId/progress: streams SSE events when given a valid token', async () => {
      const tokenRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/token`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { sseToken } = JSON.parse(tokenRes.body);

      // Test stream connection
      const streamRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/progress?token=${sseToken}&once=true`,
      });

      expect(streamRes.statusCode).toBe(200);
      expect(streamRes.headers['content-type']).toContain('text/event-stream');
      expect(streamRes.body).toContain('connected');
    });
  });

  // --- 5. Commit and Undo Flow with Before-Images ---
  describe('Commit & Undo Flow with Before-Images', () => {
    let batchId: string;
    let importFileId: string;
    const testRegNo = 'WUA-COMM-001';

    beforeAll(async () => {
      importFileId = crypto.randomUUID();
      const storageKey = `files/${importFileId}`;

      const excelBuffer = await createTestWuaWorkbook([
        {
          name: 'Commit Test WUA',
          regNo: testRegNo,
          level: 'unit',
          schemeCode: 'KRIS',
          wardCode: 'KURA-W-01',
          address: 'Old Farm Road',
          bankName: 'UBA Bank',
          bankAccountNumber: '9988776655',
          isOperational: true,
          hasMaintenanceFund: false,
        },
      ]);

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, excelBuffer);

      await testDb.insert(file).values({
        id: importFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: excelBuffer.length,
        sha256: crypto.createHash('sha256').update(excelBuffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: importFileId,
          stateId: KANO_STATE_ID,
        },
      });

      batchId = JSON.parse(initRes.body).id;

      const importService = app.get((await import('./services/import.service')).ImportService);
      await importService.validateBatch(batchId);
    });

    it('POST /imports/:batchId/commit: commits rows to core.wua and encrypts bank account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(201);
      const batch = JSON.parse(res.body);
      expect(batch.status).toBe('committed');
      expect(batch.committedRows).toBe(1);

      // Verify WUA was created in DB
      const [wuaRow] = await testDb.select().from(wua).where(eq(wua.regNo, testRegNo));
      expect(wuaRow).toBeDefined();
      expect(wuaRow.name).toBe('Commit Test WUA');
      expect(wuaRow.importBatchId).toBe(batchId);
      // Bank account is encrypted
      expect(wuaRow.bankAccountEnc).toBeDefined();

      // Verify row status is committed with targetEntityId
      const [rowRecord] = await testDb
        .select()
        .from(importRow)
        .where(eq(importRow.batchId, batchId));
      expect(rowRecord.status).toBe('committed');
      expect(rowRecord.targetEntityId).toBe(wuaRow.id);
      expect(rowRecord.beforeImage).toBeNull(); // Newly created -> beforeImage is null

      // Verify outbox event
      const [ev] = await testDb
        .select()
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.aggregateId, batchId),
            eq(outboxEvent.eventType, 'core.import.committed'),
          ),
        );
      expect(ev).toBeDefined();
    });

    it('POST /imports/:batchId/undo: soft deletes created WUA record and sets status to undone', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(201);
      const batch = JSON.parse(res.body);
      expect(batch.status).toBe('undone');

      // Verify WUA is soft deleted
      const [wuaRow] = await testDb.select().from(wua).where(eq(wua.regNo, testRegNo));
      expect(wuaRow.deletedAt).not.toBeNull();

      // Verify outbox event core.import.undone
      const [ev] = await testDb
        .select()
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.aggregateId, batchId),
            eq(outboxEvent.eventType, 'core.import.undone'),
          ),
        );
      expect(ev).toBeDefined();
    });
  });

  // --- 6. Scoped Import Batches Listing ---
  describe('GET /imports: Scope Enforcement', () => {
    let kanoBatchId: string;
    let kadunaBatchId: string;

    beforeAll(async () => {
      const [kb] = await testDb
        .insert(importBatch)
        .values({
          dataset: 'wua',
          fileId: sharedFileId,
          status: 'uploaded',
          stateId: KANO_STATE_ID,
          createdBy: ADMIN_USER_ID,
        })
        .returning();
      kanoBatchId = kb!.id;

      const [kdb] = await testDb
        .insert(importBatch)
        .values({
          dataset: 'wua',
          fileId: sharedFileId,
          status: 'uploaded',
          stateId: KADUNA_STATE_ID,
          createdBy: ADMIN_USER_ID,
        })
        .returning();
      kadunaBatchId = kdb!.id;
    });

    it('state-scoped officer only sees batches in their assigned state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/imports',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const batchIds = data.items.map((b: { id: string }) => b.id);
      expect(batchIds).toContain(kanoBatchId);
      expect(batchIds).not.toContain(kadunaBatchId);
    });

    it('national admin sees batches across all states', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const batchIds = data.items.map((b: { id: string }) => b.id);
      expect(batchIds).toContain(kanoBatchId);
      expect(batchIds).toContain(kadunaBatchId);
    });
  });

  // --- 7. Template Version Gate (BE-1.8) ---
  describe('Template Version Gate (BE-1.8)', () => {
    it('refuses workbooks whose embedded template version does not match current definition version', async () => {
      const outdatedFileId = crypto.randomUUID();
      const storageKey = `files/${outdatedFileId}`;

      // Create workbook with outdated template version 99 (definition version is 1)
      const outdatedBuffer = await createTestWuaWorkbook(
        [
          {
            name: 'Outdated Template WUA',
            level: 'unit',
            schemeCode: 'KRIS',
          },
        ],
        { templateVersion: 99 },
      );

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, outdatedBuffer);

      await testDb.insert(file).values({
        id: outdatedFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: outdatedBuffer.length,
        sha256: crypto.createHash('sha256').update(outdatedBuffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: outdatedFileId,
          stateId: KANO_STATE_ID,
        },
      });

      expect(initRes.statusCode).toBe(201);
      const batchId = JSON.parse(initRes.body).id;

      const importService = app.get((await import('./services/import.service')).ImportService);
      const result = await importService.validateBatch(batchId);

      expect(result).toBeUndefined(); // Returns early after failing
      const [batch] = await testDb.select().from(importBatch).where(eq(importBatch.id, batchId));
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorMessage).toContain(
        'Workbook template version mismatch. Expected version 1 but found 99',
      );
    });

    it('refuses workbooks with missing template version metadata', async () => {
      const missingVersionFileId = crypto.randomUUID();
      const storageKey = `files/${missingVersionFileId}`;

      // Create workbook with no version metadata
      const rawBuffer = await createTestWuaWorkbook(
        [
          {
            name: 'No Version WUA',
            level: 'unit',
            schemeCode: 'KRIS',
          },
        ],
        { templateVersion: null },
      );

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, rawBuffer);

      await testDb.insert(file).values({
        id: missingVersionFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: rawBuffer.length,
        sha256: crypto.createHash('sha256').update(rawBuffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: missingVersionFileId,
          stateId: KANO_STATE_ID,
        },
      });

      const batchId = JSON.parse(initRes.body).id;
      const importService = app.get((await import('./services/import.service')).ImportService);
      await importService.validateBatch(batchId);

      const [batch] = await testDb.select().from(importBatch).where(eq(importBatch.id, batchId));
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorMessage).toContain(
        'Workbook template version mismatch. Expected version 1 but found none',
      );
    });
  });

  // --- 8. Import Caps: Max File Size & Max Rows (BE-1.8) ---
  describe('Import Caps: Max File Size & Max Rows (BE-1.8)', () => {
    it('initiateImport rejects file sizes exceeding 50 MB before processing', async () => {
      const oversizedFileId = crypto.randomUUID();
      const storageKey = `files/${oversizedFileId}`;

      await testDb.insert(file).values({
        id: oversizedFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 55 * 1024 * 1024, // 55 MB exceeds 50 MB cap
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: oversizedFileId,
          stateId: KANO_STATE_ID,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.detail).toContain('exceeds maximum import limit of 50 MB');
    });

    it('validateBatch rejects workbooks exceeding 50,000 rows before parsing', async () => {
      const largeFileId = crypto.randomUUID();
      const storageKey = `files/${largeFileId}`;

      // Create a workbook with 50,002 rows using sparse row
      const buffer = await createTestWuaWorkbook(
        [
          {
            name: 'Small Sample WUA',
            level: 'unit',
            schemeCode: 'KRIS',
          },
        ],
        { sparseRowCount: 50002 },
      );

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, buffer);

      await testDb.insert(file).values({
        id: largeFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: largeFileId,
          stateId: KANO_STATE_ID,
        },
      });

      const batchId = JSON.parse(initRes.body).id;

      const importService = app.get((await import('./services/import.service')).ImportService);
      await importService.validateBatch(batchId);

      const [batch] = await testDb.select().from(importBatch).where(eq(importBatch.id, batchId));
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorMessage).toContain(
        'Workbook exceeds maximum row limit of 50,000 rows (found 50,001 rows)',
      );
    });
  });

  // --- 9. Undo Conflict & Reference Safety (BE-1.8) ---
  describe('Undo Conflict & Reference Safety (BE-1.8)', () => {
    it('refuses to undo rows modified after import or inserted rows now referenced by other records', async () => {
      const undoFileId = crypto.randomUUID();
      const storageKey = `files/${undoFileId}`;
      const regNoModified = 'WUA-SAFE-MOD-01';
      const regNoReferenced = 'WUA-SAFE-REF-02';

      const excelBuffer = await createTestWuaWorkbook([
        {
          name: 'To Be Modified WUA',
          regNo: regNoModified,
          level: 'unit',
          schemeCode: 'KRIS',
          wardCode: 'KURA-W-01',
          address: 'Mod Road',
          bankName: 'First Bank',
          bankAccountNumber: '1111222233',
          isOperational: true,
          hasMaintenanceFund: true,
        },
        {
          name: 'To Be Referenced WUA',
          regNo: regNoReferenced,
          level: 'sector',
          schemeCode: 'KRIS',
          wardCode: 'KURA-W-01',
          address: 'Ref Road',
          bankName: 'GTBank',
          bankAccountNumber: '4444555566',
          isOperational: true,
          hasMaintenanceFund: false,
        },
      ]);

      const mockMap = (storageService as unknown as { mockStorageFiles: Map<string, Buffer> })
        .mockStorageFiles;
      mockMap.set(storageKey, excelBuffer);

      await testDb.insert(file).values({
        id: undoFileId,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: excelBuffer.length,
        sha256: crypto.createHash('sha256').update(excelBuffer).digest('hex'),
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'wua',
          fileId: undoFileId,
          stateId: KANO_STATE_ID,
        },
      });

      const batchId = JSON.parse(initRes.body).id;
      const importService = app.get((await import('./services/import.service')).ImportService);
      await importService.validateBatch(batchId);

      // Commit the batch
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      // 1. Modify the first WUA row directly (incrementing version to simulate concurrent update)
      const [rowMod] = await testDb.select().from(wua).where(eq(wua.regNo, regNoModified));
      expect(rowMod).toBeDefined();
      await testDb
        .update(wua)
        .set({
          name: 'Modified WUA Name After Import',
          version: rowMod.version + 1, // version is now 2
        })
        .where(eq(wua.id, rowMod.id));

      // 2. Reference the second WUA row in wua_officer
      const [rowRef] = await testDb.select().from(wua).where(eq(wua.regNo, regNoReferenced));
      expect(rowRef).toBeDefined();
      await testDb.insert(wuaOfficer).values({
        id: crypto.randomUUID(),
        wuaId: rowRef.id,
        office: 'chair',
        fullName: 'Alhaji Musa Officer',
        phone: '+2348011223344',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      // 3. Attempt to undo the batch
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(undoRes.statusCode).toBe(201);
      const undoData = JSON.parse(undoRes.body);
      expect(undoData.status).toBe('undone');
      expect(undoData.undoneRowsCount).toBe(0);
      expect(undoData.skippedRowsCount).toBe(2);
      expect(undoData.skippedRows).toHaveLength(2);

      // Verify reasons
      const skippedMod = undoData.skippedRows.find(
        (r: { entityId: string }) => r.entityId === rowMod.id,
      );
      expect(skippedMod).toBeDefined();
      expect(skippedMod.reason).toContain('modified after import');

      const skippedRef = undoData.skippedRows.find(
        (r: { entityId: string }) => r.entityId === rowRef.id,
      );
      expect(skippedRef).toBeDefined();
      expect(skippedRef.reason).toContain('referenced by other records');

      // Verify neither record was soft-deleted
      const [checkMod] = await testDb.select().from(wua).where(eq(wua.id, rowMod.id));
      expect(checkMod.deletedAt).toBeNull();

      const [checkRef] = await testDb.select().from(wua).where(eq(wua.id, rowRef.id));
      expect(checkRef.deletedAt).toBeNull();
    });
  });
});
