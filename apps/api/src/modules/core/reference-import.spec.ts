import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  ward,
  lga,
  file,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { ImportService } from './services/import.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Reference Data Import Handlers (BE-Geography & Reference Imports)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let importService: ImportService;
  let activeBuffer: Buffer | null = null;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_ref_import_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  const ADMIN_USER_ID = crypto.randomUUID();
  const KANO_ADMIN_USER_ID = crypto.randomUUID();
  const FIELD_USER_ID = crypto.randomUUID();
  const SYSTEM_USER_ID = crypto.randomUUID();

  const SYS_ADMIN_ROLE_ID = crypto.randomUUID();
  const PROG_ADMIN_ROLE_ID = crypto.randomUUID();
  const FIELD_OFFICER_ROLE_ID = crypto.randomUUID();

  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();

  let adminToken: string;
  let kanoAdminToken: string;
  let fieldToken: string;
  let sharedFileId: string;

  beforeAll(async () => {
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);

    const { migrate } = await import('@idmis/db');
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    const { initAuditWriter } = await import('../../platform/audit/audit-writer');
    initAuditWriter();

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
    importService = app.get(ImportService);
    storageService.getObjectBuffer = async () => {
      if (!activeBuffer) throw new Error('No active buffer set in test');
      return activeBuffer;
    };

    // Seed Users
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$fakeHashfakeHashfakeHashfakeHashfakeHash$fake';
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system_ref@idmis.gov.ng',
        username: 'system_ref',
        fullName: 'System User',
        passwordHash: dummyHash,
        isActive: true,
      },
      {
        id: ADMIN_USER_ID,
        email: 'sysadmin_ref@idmis.gov.ng',
        username: 'sysadmin_ref',
        fullName: 'System Admin Ref',
        passwordHash: dummyHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
      },
      {
        id: KANO_ADMIN_USER_ID,
        email: 'kano_admin@idmis.gov.ng',
        username: 'kano_admin',
        fullName: 'Kano Admin',
        passwordHash: dummyHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
      },
      {
        id: FIELD_USER_ID,
        email: 'field_ref@idmis.gov.ng',
        username: 'field_ref',
        fullName: 'Field Officer',
        passwordHash: dummyHash,
        isActive: true,
      },
    ]);

    // Seed States
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_ID,
        code: 'LA',
        name: 'Lagos State',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Seed Roles
    await testDb.insert(role).values([
      { id: SYS_ADMIN_ROLE_ID, key: 'system_admin', name: 'System Admin', isSystem: true },
      { id: PROG_ADMIN_ROLE_ID, key: 'programme_admin', name: 'Programme Admin', isSystem: true },
      { id: FIELD_OFFICER_ROLE_ID, key: 'field_officer', name: 'Field Officer', isSystem: true },
    ]);

    // System Admin: all permissions
    const allPerms = Object.values(permissions);
    await testDb.insert(rolePermission).values(
      allPerms.map((perm) => ({
        roleId: SYS_ADMIN_ROLE_ID,
        permission: perm,
      })),
    );

    // Programme Admin: CORE_IMPORT_RUN and CORE_ORGANISATION_MANAGE
    await testDb.insert(rolePermission).values([
      { roleId: PROG_ADMIN_ROLE_ID, permission: permissions.CORE_IMPORT_RUN },
      { roleId: PROG_ADMIN_ROLE_ID, permission: permissions.CORE_ORGANISATION_MANAGE },
    ]);

    // Field Officer: CORE_IMPORT_RUN only (no CORE_ORGANISATION_MANAGE)
    await testDb
      .insert(rolePermission)
      .values([{ roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_IMPORT_RUN }]);

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

    // Kano Admin: state scope (Kano)
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_ADMIN_USER_ID,
      roleId: PROG_ADMIN_ROLE_ID,
      module: 'core',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Field Officer: national scope but lacking CORE_ORGANISATION_MANAGE
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: FIELD_USER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Auth Tokens
    const sidAdmin = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidAdmin,
      familyId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    adminToken = (await tokenService.createAccessToken(ADMIN_USER_ID, sidAdmin)).accessToken;

    const sidKano = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKano,
      familyId: crypto.randomUUID(),
      userId: KANO_ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kanoAdminToken = (await tokenService.createAccessToken(KANO_ADMIN_USER_ID, sidKano))
      .accessToken;

    const sidField = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidField,
      familyId: crypto.randomUUID(),
      userId: FIELD_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    fieldToken = (await tokenService.createAccessToken(FIELD_USER_ID, sidField)).accessToken;

    sharedFileId = crypto.randomUUID();
    await testDb.insert(file).values({
      id: sharedFileId,
      storageKey: `files/${sharedFileId}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
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
      // ignore
    }
    await adminClient.end();
  }, 20000);

  async function createWorkbookBuffer(
    dataset: string,
    columns: Array<{ header: string; key: string }>,
    rows: Array<Record<string, unknown>>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.description = JSON.stringify({ dataset, version: 1 });
    workbook.keywords = `templateVersion:1;dataset:${dataset}`;
    workbook.subject = '1';

    const metaSheet = workbook.addWorksheet('_metadata');
    metaSheet.state = 'veryHidden';
    metaSheet.getCell('A1').value = 'template_version';
    metaSheet.getCell('B1').value = 1;
    metaSheet.getCell('A2').value = 'dataset';
    metaSheet.getCell('B2').value = dataset;

    const dataSheet = workbook.addWorksheet('Data');
    dataSheet.columns = columns;
    for (const r of rows) {
      dataSheet.addRow(r);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  describe('1. LGA Import Handler', () => {
    const lgaColumns = [
      { header: 'LGA Code *', key: 'code' },
      { header: 'LGA Name *', key: 'name' },
      { header: 'State Code *', key: 'state_code' },
    ];

    it('denies non-admin users without CORE_ORGANISATION_MANAGE', async () => {
      const buffer = await createWorkbookBuffer('lga', lgaColumns, [
        { code: 'NG020901', name: 'Test LGA', state_code: 'KN' },
      ]);
      activeBuffer = buffer;

      const res = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${fieldToken}` },
        payload: { dataset: 'lga', fileId: sharedFileId },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects an LGA referencing a bad/non-existent state_code', async () => {
      const buffer = await createWorkbookBuffer('lga', lgaColumns, [
        { code: 'NG999001', name: 'Ghost LGA', state_code: 'NON_EXISTENT' },
      ]);
      activeBuffer = buffer;

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'lga', fileId: sharedFileId },
      });
      expect(initRes.statusCode).toBe(201);
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);
      await importService.validateBatch(batchId);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const preview = previewRes.json();
      expect(preview.batch.status).toBe('validation_failed');
      expect(preview.rows[0].status).toBe('error');
      expect(preview.rows[0].errors[0].message).toContain('Referenced State Code');
    });

    it('rejects out-of-scope state for a scoped admin', async () => {
      // Kano admin tries to import a Lagos LGA
      const buffer = await createWorkbookBuffer('lga', lgaColumns, [
        { code: 'NG025001', name: 'Ikeja', state_code: 'LA' },
      ]);
      activeBuffer = buffer;

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${kanoAdminToken}` },
        payload: { dataset: 'lga', fileId: sharedFileId, stateId: KANO_STATE_ID },
      });
      expect(initRes.statusCode).toBe(201);
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);
      await importService.validateBatch(batchId);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${kanoAdminToken}` },
      });
      const preview = previewRes.json();
      expect(preview.batch.status).toBe('validation_failed');
      expect(preview.rows[0].errors[0].code).toBe('out_of_scope');
    });

    it('upserts by code, supports re-import without duplicates, and undoes cleanly', async () => {
      const rows = [{ code: 'NG020801', name: 'Kano North LGA', state_code: 'KN' }];
      const buffer = await createWorkbookBuffer('lga', lgaColumns, rows);
      activeBuffer = buffer;

      // 1. Initial Import
      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'lga', fileId: sharedFileId },
      });
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);
      await importService.validateBatch(batchId);

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      // Verify row in database
      const [insertedLga] = await testDb.select().from(lga).where(eq(lga.code, 'NG020801'));
      expect(insertedLga).toBeDefined();
      expect(insertedLga?.name).toBe('Kano North LGA');

      // 2. Re-import of same file with updated name: upserts without duplicate error
      const updateBuffer = await createWorkbookBuffer('lga', lgaColumns, [
        { code: 'NG020801', name: 'Kano North Central LGA', state_code: 'KN' },
      ]);
      activeBuffer = updateBuffer;

      const init2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'lga', fileId: sharedFileId },
      });
      const batch2Id = init2.json().id;
      await importService.validateBatch(batch2Id);
      await importService.validateBatch(batch2Id);

      const commit2 = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commit2.statusCode).toBe(201);

      const [updatedLga] = await testDb.select().from(lga).where(eq(lga.code, 'NG020801'));
      expect(updatedLga?.name).toBe('Kano North Central LGA');

      // 3. Undo re-import: restores previous name
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [restoredLga] = await testDb.select().from(lga).where(eq(lga.code, 'NG020801'));
      expect(restoredLga?.name).toBe('Kano North LGA');

      // 4. Undo initial import: deletes inserted LGA
      const undo1 = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undo1.statusCode).toBe(201);

      const [deletedLga] = await testDb.select().from(lga).where(eq(lga.code, 'NG020801'));
      expect(deletedLga).toBeUndefined();
    });
  });

  describe('2. Ward Import Handler', () => {
    const wardColumns = [
      { header: 'Ward Code *', key: 'code' },
      { header: 'Ward Name *', key: 'name' },
      { header: 'LGA Code *', key: 'lga_code' },
    ];

    let parentLgaId: string;
    beforeAll(async () => {
      parentLgaId = crypto.randomUUID();
      await testDb.insert(lga).values({
        id: parentLgaId,
        code: 'NG020701',
        name: 'Parent Kano LGA',
        stateId: KANO_STATE_ID,
      });
    });

    it('rejects a Ward referencing a non-existent lga_code', async () => {
      const buffer = await createWorkbookBuffer('ward', wardColumns, [
        { code: 'G3-701001', name: 'Ghost Ward', lga_code: 'NON_EXISTENT_LGA' },
      ]);
      activeBuffer = buffer;

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'ward', fileId: sharedFileId },
      });
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const preview = previewRes.json();
      expect(preview.batch.status).toBe('validation_failed');
      expect(preview.rows[0].errors[0].message).toContain('Referenced LGA Code');
    });

    it('upserts by code, supports re-import without duplicates, and undoes cleanly', async () => {
      const rows = [{ code: 'G3-701001', name: 'Kano Ward A', lga_code: 'NG020701' }];
      const buffer = await createWorkbookBuffer('ward', wardColumns, rows);
      activeBuffer = buffer;

      // 1. Initial import
      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'ward', fileId: sharedFileId },
      });
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [insertedWard] = await testDb.select().from(ward).where(eq(ward.code, 'G3-701001'));
      expect(insertedWard).toBeDefined();
      expect(insertedWard?.name).toBe('Kano Ward A');

      // 2. Re-import with name update
      const updateBuffer = await createWorkbookBuffer('ward', wardColumns, [
        { code: 'G3-701001', name: 'Kano Ward A Updated', lga_code: 'NG020701' },
      ]);
      activeBuffer = updateBuffer;

      const init2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'ward', fileId: sharedFileId },
      });
      const batch2Id = init2.json().id;
      await importService.validateBatch(batch2Id);

      const commit2 = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commit2.statusCode).toBe(201);

      const [updatedWard] = await testDb.select().from(ward).where(eq(ward.code, 'G3-701001'));
      expect(updatedWard?.name).toBe('Kano Ward A Updated');

      // 3. Undo re-import restores previous name
      const undo2 = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undo2.statusCode).toBe(201);

      const [restoredWard] = await testDb.select().from(ward).where(eq(ward.code, 'G3-701001'));
      expect(restoredWard?.name).toBe('Kano Ward A');

      // 4. Undo initial import deletes ward
      const undo1 = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undo1.statusCode).toBe(201);

      const [deletedWard] = await testDb.select().from(ward).where(eq(ward.code, 'G3-701001'));
      expect(deletedWard).toBeUndefined();
    });
  });

  describe('3. Organisation Import Handler', () => {
    const orgColumns = [
      { header: 'Organisation Code *', key: 'code' },
      { header: 'Organisation Name *', key: 'name' },
      { header: 'Type *', key: 'type' },
      { header: 'Parent Code', key: 'parent_code' },
      { header: 'State Codes', key: 'state_codes' },
      { header: 'Short Name', key: 'short_name' },
      { header: 'Irrigable Area (Ha)', key: 'irrigable_area_ha' },
    ];

    it('enforces parent rules: scheme must reference an existing rbda', async () => {
      // 1. Missing parent code
      const bufMissing = await createWorkbookBuffer('organisation', orgColumns, [
        { code: 'SCH-ERR1', name: 'Scheme 1', type: 'scheme', parent_code: '' },
      ]);
      activeBuffer = bufMissing;

      const init1 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId },
      });
      const batchId1 = init1.json().id;
      await importService.validateBatch(batchId1);
      const preview1 = await app.inject({
        method: 'GET',
        url: `/imports/${batchId1}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(preview1.json().rows[0].errors[0].message).toContain(
        'Parent organisation code is required for scheme',
      );

      // 2. Non-existent parent code
      const bufGhost = await createWorkbookBuffer('organisation', orgColumns, [
        { code: 'SCH-ERR2', name: 'Scheme 2', type: 'scheme', parent_code: 'GHOST_RBDA' },
      ]);
      activeBuffer = bufGhost;

      const init2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId },
      });
      const batchId2 = init2.json().id;
      await importService.validateBatch(batchId2);
      const preview2 = await app.inject({
        method: 'GET',
        url: `/imports/${batchId2}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(preview2.json().rows[0].errors[0].message).toContain(
        "Referenced parent organisation 'GHOST_RBDA' does not exist",
      );
    });

    it('enforces parent rules: sector must reference an existing scheme (not rbda)', async () => {
      // Create an RBDA
      await testDb.insert(organisation).values({
        id: crypto.randomUUID(),
        code: 'TEST_RBDA_A',
        name: 'Test RBDA A',
        type: 'rbda',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Sector trying to set RBDA as parent
      const bufBadParent = await createWorkbookBuffer('organisation', orgColumns, [
        { code: 'SEC-ERR1', name: 'Sector 1', type: 'sector', parent_code: 'TEST_RBDA_A' },
      ]);
      activeBuffer = bufBadParent;

      const init = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId },
      });
      const batchId = init.json().id;
      await importService.validateBatch(batchId);
      const preview = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(preview.json().rows[0].errors[0].message).toContain(
        "Parent organisation for a sector must have type 'scheme'",
      );
    });

    it('enforces scope: non-national user cannot import RBDA organisations', async () => {
      const bufRbda = await createWorkbookBuffer('organisation', orgColumns, [
        { code: 'RBDA_SPOOF', name: 'Spoofed RBDA', type: 'rbda' },
      ]);
      activeBuffer = bufRbda;

      const init = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${kanoAdminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId, stateId: KANO_STATE_ID },
      });
      const batchId = init.json().id;
      await importService.validateBatch(batchId);
      const preview = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${kanoAdminToken}` },
      });
      expect(preview.json().rows[0].errors[0].code).toBe('out_of_scope');
    });

    it('successfully imports valid RBDA, Scheme, and Sector hierarchy, upserts on re-import, and undoes cleanly', async () => {
      // 1. Initial import of RBDA, Scheme, and Sector
      const orgRows = [
        { code: 'HJRBDA_TEST', name: 'Hadejia-Jamaare RBDA Test', type: 'rbda', state_codes: 'KN' },
        {
          code: 'KRIS_TEST',
          name: 'Kano River Scheme Test',
          type: 'scheme',
          parent_code: 'HJRBDA_TEST',
          state_codes: 'KN',
          irrigable_area_ha: 14500,
        },
        {
          code: 'SEC1_TEST',
          name: 'Sector 1 Test',
          type: 'sector',
          parent_code: 'KRIS_TEST',
          state_codes: 'KN',
        },
      ];
      const buffer = await createWorkbookBuffer('organisation', orgColumns, orgRows);
      activeBuffer = buffer;

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId },
      });
      const batchId = initRes.json().id;
      await importService.validateBatch(batchId);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(previewRes.json().batch.status).toBe('validated');
      expect(previewRes.json().rows.every((r: { status: string }) => r.status === 'valid')).toBe(
        true,
      );

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      // Verify in DB
      const [rbdaRow] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'HJRBDA_TEST'));
      const [schemeRow] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'KRIS_TEST'));
      const [sectorRow] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'SEC1_TEST'));

      expect(rbdaRow).toBeDefined();
      expect(schemeRow?.parentId).toBe(rbdaRow?.id);
      expect(sectorRow?.parentId).toBe(schemeRow?.id);

      // 2. Re-import with modifications (upsert by code without duplicate errors)
      const updateRows = [
        {
          code: 'HJRBDA_TEST',
          name: 'Hadejia-Jamaare RBDA Test Updated',
          type: 'rbda',
          state_codes: 'KN',
        },
        {
          code: 'KRIS_TEST',
          name: 'Kano River Scheme Test Updated',
          type: 'scheme',
          parent_code: 'HJRBDA_TEST',
          state_codes: 'KN',
          irrigable_area_ha: 15000,
        },
        {
          code: 'SEC1_TEST',
          name: 'Sector 1 Test Updated',
          type: 'sector',
          parent_code: 'KRIS_TEST',
          state_codes: 'KN',
        },
      ];
      const updateBuffer = await createWorkbookBuffer('organisation', orgColumns, updateRows);
      activeBuffer = updateBuffer;

      const init2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataset: 'organisation', fileId: sharedFileId },
      });
      const batch2Id = init2.json().id;
      await importService.validateBatch(batch2Id);

      const commit2 = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commit2.statusCode).toBe(201);

      const [updatedScheme] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'KRIS_TEST'));
      expect(updatedScheme?.name).toBe('Kano River Scheme Test Updated');
      expect(Number(updatedScheme?.irrigableAreaHa)).toBe(15000);

      // 3. Undo re-import restores previous version and values
      const undo2 = await app.inject({
        method: 'POST',
        url: `/imports/${batch2Id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undo2.statusCode).toBe(201);

      const [restoredScheme] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'KRIS_TEST'));
      expect(restoredScheme?.name).toBe('Kano River Scheme Test');
      expect(Number(restoredScheme?.irrigableAreaHa)).toBe(14500);

      // 4. Undo initial import: soft-deletes the organisations
      const undo1 = await app.inject({
        method: 'POST',
        url: `/imports/${batchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undo1.statusCode).toBe(201);

      const [softDeletedScheme] = await testDb
        .select()
        .from(organisation)
        .where(eq(organisation.code, 'KRIS_TEST'));
      expect(softDeletedScheme?.deletedAt).not.toBeNull();
    });
  });
});
