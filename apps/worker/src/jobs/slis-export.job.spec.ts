import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import {
  appUser,
  assignment,
  auditLog,
  farmer,
  farmerIdentity,
  file,
  lookupType,
  lookupValue,
  organisation,
  role,
  rolePermission,
  exportJob,
  state,
  eq,
  and,
  postgres,
  drizzle,
  migrate,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { EncryptionService } from '@idmis/db/security';
import { processSlisExportJob, type SlisExportJobOptions } from './slis-export.job';

describe('Worker SLIS Export Job Specification (BE-2.8)', { timeout: 30000 }, () => {
  const TEST_DB_NAME = `idmis_slis_worker_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';
  const TEST_DB_URL = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  const mockStorageFiles = new Map<string, Buffer>();
  const mockS3Client = {
    send: async (command: {
      constructor?: { name: string };
      input?: { Key?: string; Body?: unknown };
    }) => {
      const cmdName = command.constructor?.name;
      if (cmdName === 'PutObjectCommand') {
        const key = command.input?.Key;
        const body = command.input?.Body;
        if (key && body) {
          mockStorageFiles.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array));
        }
        return { ETag: '"mock-etag"' };
      }
      return {};
    },
  };

  const SYSTEM_USER_ID = '018f3a5e-1000-7000-8000-000000000001';
  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';
  const PRIVILEGED_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000004';
  const REVOKED_USER_ID = '018f3a5e-1000-7000-8000-000000000005';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const DOC_TYPE_NIN = '018f3a5e-3000-7000-8000-000000000001';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL, { max: 5 });
    testDb = drizzle(testClient, { schema });

    const migrationsFolder = path.resolve(__dirname, '../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$fake';
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System',
        passwordHash: dummyHash,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano_officer@idmis.gov.ng',
        fullName: 'Kano Officer',
        passwordHash: dummyHash,
      },
      {
        id: PRIVILEGED_OFFICER_ID,
        email: 'privileged@idmis.gov.ng',
        fullName: 'Privileged Officer',
        passwordHash: dummyHash,
      },
      {
        id: REVOKED_USER_ID,
        email: 'revoked@idmis.gov.ng',
        fullName: 'Revoked User',
        passwordHash: dummyHash,
      },
    ]);

    await testDb.insert(state).values({
      id: KANO_STATE_ID,
      code: 'KN',
      name: 'Kano',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        type: 'scheme',
        code: 'SCH-KN',
        name: 'Kano Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const ltNinId = crypto.randomUUID();
    await testDb.insert(lookupType).values({
      id: ltNinId,
      key: 'identity_document_type',
      name: 'Identity Document Type',
      module: 'slis',
      isSystem: true,
    });
    await testDb.insert(lookupValue).values({
      id: DOC_TYPE_NIN,
      lookupTypeId: ltNinId,
      code: 'nin',
      label: 'National Identity Number (NIN)',
    });

    const roleSchemeOfficer = crypto.randomUUID();
    const rolePrivileged = crypto.randomUUID();

    await testDb.insert(role).values([
      { id: roleSchemeOfficer, name: 'Scheme Officer', key: 'scheme_officer', isSystem: true },
      { id: rolePrivileged, name: 'Privileged Officer', key: 'privileged_officer', isSystem: true },
    ]);

    await testDb.insert(rolePermission).values([
      { roleId: roleSchemeOfficer, permission: 'slis.export.generate' },
      { roleId: roleSchemeOfficer, permission: 'slis.farmer.read' },
      { roleId: rolePrivileged, permission: 'slis.export.generate' },
      { roleId: rolePrivileged, permission: 'slis.farmer.read' },
      { roleId: rolePrivileged, permission: 'slis.identity.view' },
    ]);

    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        roleId: roleSchemeOfficer,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: PRIVILEGED_OFFICER_ID,
        roleId: rolePrivileged,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: REVOKED_USER_ID,
        roleId: roleSchemeOfficer,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Insert 1 farmer with identity doc
    const farmerId = crypto.randomUUID();
    await testDb.insert(farmer).values({
      id: farmerId,
      schemeId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
      farmerCode: 'KN-F-01',
      firstName: 'Amina',
      lastName: 'Kano',
      gender: 'female',
      status: 'approved',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const rawNin = '12345678901';
    const numEnc = new EncryptionService().encrypt(rawNin).toString('hex');

    await testDb.insert(farmerIdentity).values({
      id: crypto.randomUUID(),
      farmerId,
      documentTypeId: DOC_TYPE_NIN,
      numberEnc: numEnc,
      numberHash: crypto.createHash('sha256').update(rawNin).digest('hex'),
      numberLast4: '8901',
      uniquePerPerson: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Fast bulk seed 50,000 farmers via generate_series (disable triggers for fast synthetic bulk setup)
    await testClient.unsafe('ALTER TABLE "slis"."farmer" DISABLE TRIGGER ALL;');
    await testClient.unsafe(`
      INSERT INTO "slis"."farmer" (
        "id", "scheme_id", "state_id", "farmer_code", "first_name", "last_name",
        "gender", "status", "created_by", "updated_by"
      )
      SELECT
        gen_random_uuid(),
        '${KANO_SCHEME_ID}'::uuid,
        '${KANO_STATE_ID}'::uuid,
        'BULK-' || i,
        CASE WHEN i = 1 THEN '=CMD|'' /C calc''!A0' WHEN i = 2 THEN '+DangerousFormula' ELSE 'Farmer' || i END,
        'BulkLastName',
        CASE WHEN i % 2 = 0 THEN 'female' ELSE 'male' END,
        'approved',
        '${SYSTEM_USER_ID}'::uuid,
        '${SYSTEM_USER_ID}'::uuid
      FROM generate_series(1, 50000) AS i;
    `);
    await testClient.unsafe('ALTER TABLE "slis"."farmer" ENABLE TRIGGER ALL;');
  });

  afterAll(async () => {
    if (testClient) await testClient.end({ timeout: 5 });
    if (adminClient) {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end({ timeout: 5 });
    }
  });

  it('streams 50,000 rows with bounded memory and formula safety', async () => {
    const exportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: exportId,
      userId: KANO_OFFICER_ID,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    const memBefore = process.memoryUsage().heapUsed;
    const result = await processSlisExportJob({
      exportId,
      userId: KANO_OFFICER_ID,
      dataset: 'farmers',
      filters: {},
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });
    const memAfter = process.memoryUsage().heapUsed;
    expect(memAfter).toBeGreaterThan(0);
    expect(memBefore).toBeGreaterThan(0);

    expect(result.status).toBe('completed');
    expect(result.rowCount).toBeGreaterThanOrEqual(50001);
    expect(result.peakHeapMb).toBeLessThan(512); // Bound memory < 512MB!

    const storageKey = `exports/${exportId}.xlsx`;
    const exportedBuffer = mockStorageFiles.get(storageKey);
    expect(exportedBuffer).toBeDefined();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      exportedBuffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
    );
    const ws = wb.getWorksheet('Data')!;
    expect(ws.rowCount).toBeGreaterThanOrEqual(50001);

    let foundBulk1 = false;
    let foundBulk2 = false;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = row.getCell(2).value;
      if (code === 'BULK-1') {
        const cellVal = String(row.getCell(3).value);
        expect(cellVal.startsWith("'=")).toBe(true);
        foundBulk1 = true;
      } else if (code === 'BULK-2') {
        const cellVal = String(row.getCell(3).value);
        expect(cellVal.startsWith("'+")).toBe(true);
        foundBulk2 = true;
      }
      if (foundBulk1 && foundBulk2) break;
    }
    expect(foundBulk1).toBe(true);
    expect(foundBulk2).toBe(true);

    // Audit log check
    const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.entityId, exportId));
    expect(audit).toBeDefined();
    expect(audit.action).toBe('export');
    expect(audit.entityType).toBe('slis.report');
  });

  it('masks identity numbers (***last4) without slis.identity.view and unmasks with it', async () => {
    // 1. Masked run (Kano Officer)
    const maskedExportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: maskedExportId,
      userId: KANO_OFFICER_ID,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    await processSlisExportJob({
      exportId: maskedExportId,
      userId: KANO_OFFICER_ID,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    const maskedBuf = mockStorageFiles.get(`exports/${maskedExportId}.xlsx`)!;
    const wbMasked = new ExcelJS.Workbook();
    await wbMasked.xlsx.load(
      maskedBuf as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
    );
    const wsMasked = wbMasked.getWorksheet('Data')!;

    let foundMasked = false;
    for (let r = 2; r <= wsMasked.rowCount; r++) {
      const row = wsMasked.getRow(r);
      if (row.getCell(2).value === 'KN-F-01') {
        expect(String(row.getCell(10).value)).toBe('***8901');
        foundMasked = true;
        break;
      }
    }
    expect(foundMasked).toBe(true);

    // 2. Unmasked run (Privileged Officer)
    const unmaskedExportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: unmaskedExportId,
      userId: PRIVILEGED_OFFICER_ID,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    await processSlisExportJob({
      exportId: unmaskedExportId,
      userId: PRIVILEGED_OFFICER_ID,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    const unmaskedBuf = mockStorageFiles.get(`exports/${unmaskedExportId}.xlsx`)!;
    const wbUnmasked = new ExcelJS.Workbook();
    await wbUnmasked.xlsx.load(
      unmaskedBuf as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
    );
    const wsUnmasked = wbUnmasked.getWorksheet('Data')!;

    let foundUnmasked = false;
    for (let r = 2; r <= wsUnmasked.rowCount; r++) {
      const row = wsUnmasked.getRow(r);
      if (row.getCell(2).value === 'KN-F-01') {
        expect(String(row.getCell(10).value)).toBe('12345678901');
        foundUnmasked = true;
        break;
      }
    }
    expect(foundUnmasked).toBe(true);
  });

  it('scope revoked between enqueue and run -> job failed, no file, no core.file row', async () => {
    const exportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: exportId,
      userId: REVOKED_USER_ID,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    // Revoke assignments
    await testDb.delete(assignment).where(eq(assignment.userId, REVOKED_USER_ID));

    const result = await processSlisExportJob({
      exportId,
      userId: REVOKED_USER_ID,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    expect(result.status).toBe('failed');
    const [failedJob] = await testDb.select().from(exportJob).where(eq(exportJob.id, exportId));
    expect(failedJob.status).toBe('failed');
    expect(mockStorageFiles.has(`exports/${exportId}.xlsx`)).toBe(false);

    const fileRows = await testDb.select().from(file).where(eq(file.ownerId, exportId));
    expect(fileRows.length).toBe(0);
  });

  it('export permission removed between enqueue and run -> failed', async () => {
    const exportId = crypto.randomUUID();
    const testUserId = crypto.randomUUID();
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$fake';

    await testDb.insert(appUser).values({
      id: testUserId,
      email: `perm_removed_${Date.now()}@idmis.gov.ng`,
      fullName: 'Perm Removed User',
      passwordHash: dummyHash,
    });

    const testRoleId = crypto.randomUUID();
    await testDb.insert(role).values({
      id: testRoleId,
      key: `temp_exporter_${Date.now()}`,
      name: 'Temp Exporter',
      isSystem: false,
    });
    await testDb.insert(rolePermission).values([
      { roleId: testRoleId, permission: 'slis.export.generate' },
      { roleId: testRoleId, permission: 'slis.farmer.read' },
    ]);
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: testUserId,
      roleId: testRoleId,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: KANO_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(exportJob).values({
      id: exportId,
      userId: testUserId,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    // Remove export permission
    await testDb
      .delete(rolePermission)
      .where(
        and(
          eq(rolePermission.roleId, testRoleId),
          eq(rolePermission.permission, 'slis.export.generate'),
        ),
      );

    const result = await processSlisExportJob({
      exportId,
      userId: testUserId,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    expect(result.status).toBe('failed');
    const [failedJob] = await testDb.select().from(exportJob).where(eq(exportJob.id, exportId));
    expect(failedJob.status).toBe('failed');
    expect(mockStorageFiles.has(`exports/${exportId}.xlsx`)).toBe(false);
  });

  it('an rbda-scoped user exports only the schemes under their RBDA', async () => {
    const rbdaUserId = crypto.randomUUID();
    const rbdaAId = crypto.randomUUID();
    const rbdaBId = crypto.randomUUID();
    const schemeAId = crypto.randomUUID();
    const schemeBId = crypto.randomUUID();
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$fake';

    await testDb.insert(appUser).values({
      id: rbdaUserId,
      email: `rbda_${Date.now()}@idmis.gov.ng`,
      fullName: 'RBDA User',
      passwordHash: dummyHash,
    });

    await testDb.insert(organisation).values([
      {
        id: rbdaAId,
        type: 'rbda',
        code: `RBDA-A-${Date.now()}`,
        name: 'RBDA A',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: rbdaBId,
        type: 'rbda',
        code: `RBDA-B-${Date.now()}`,
        name: 'RBDA B',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: schemeAId,
        parentId: rbdaAId,
        type: 'scheme',
        code: `SCH-A-${Date.now()}`,
        name: 'Scheme A (under RBDA A)',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: schemeBId,
        parentId: rbdaBId,
        type: 'scheme',
        code: `SCH-B-${Date.now()}`,
        name: 'Scheme B (under RBDA B)',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const rbdaRoleId = crypto.randomUUID();
    await testDb.insert(role).values({
      id: rbdaRoleId,
      key: `rbda_role_${Date.now()}`,
      name: 'RBDA Role',
      isSystem: false,
    });
    await testDb.insert(rolePermission).values([
      { roleId: rbdaRoleId, permission: 'slis.export.generate' },
      { roleId: rbdaRoleId, permission: 'slis.farmer.read' },
    ]);
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: rbdaUserId,
      roleId: rbdaRoleId,
      module: 'slis',
      scopeType: 'rbda',
      scopeOrgId: rbdaAId,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const farmerAId = crypto.randomUUID();
    const farmerBId = crypto.randomUUID();
    await testDb.insert(farmer).values([
      {
        id: farmerAId,
        schemeId: schemeAId,
        stateId: KANO_STATE_ID,
        farmerCode: `FA-${Date.now()}`,
        firstName: 'FarmerA',
        lastName: 'UnderRBDA-A',
        gender: 'male',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: farmerBId,
        schemeId: schemeBId,
        stateId: KANO_STATE_ID,
        farmerCode: `FB-${Date.now()}`,
        firstName: 'FarmerB',
        lastName: 'UnderRBDA-B',
        gender: 'female',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const exportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: exportId,
      userId: rbdaUserId,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    const result = await processSlisExportJob({
      exportId,
      userId: rbdaUserId,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    expect(result.status).toBe('completed');

    const fileBuf = mockStorageFiles.get(`exports/${exportId}.xlsx`)!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuf as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
    const ws = wb.getWorksheet('Data')!;

    let hasFarmerA = false;
    let hasFarmerB = false;

    for (let r = 2; r <= ws.rowCount; r++) {
      const code = ws.getRow(r).getCell(2).value;
      if (code === `FA-${Date.now()}` || code?.toString().startsWith('FA-')) hasFarmerA = true;
      if (code === `FB-${Date.now()}` || code?.toString().startsWith('FB-')) hasFarmerB = true;
    }

    expect(hasFarmerA).toBe(true);
    expect(hasFarmerB).toBe(false);
  });

  it('a user with identity.view for scheme A only: scheme A rows unmasked, scheme B rows masked', async () => {
    const officerId = crypto.randomUUID();
    const schemeAId = crypto.randomUUID();
    const schemeBId = crypto.randomUUID();
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$fake';

    await testDb.insert(appUser).values({
      id: officerId,
      email: `id_view_${Date.now()}@idmis.gov.ng`,
      fullName: 'ID View Officer',
      passwordHash: dummyHash,
    });

    await testDb.insert(organisation).values([
      {
        id: schemeAId,
        type: 'scheme',
        code: `SCH-ID-A-${Date.now()}`,
        name: 'Scheme ID A',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: schemeBId,
        type: 'scheme',
        code: `SCH-ID-B-${Date.now()}`,
        name: 'Scheme ID B',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const readAndExportRole = crypto.randomUUID();
    const identityRole = crypto.randomUUID();

    await testDb.insert(role).values([
      {
        id: readAndExportRole,
        key: `reader_exp_${Date.now()}`,
        name: 'Reader Exp',
        isSystem: false,
      },
      { id: identityRole, key: `id_viewer_${Date.now()}`, name: 'ID Viewer', isSystem: false },
    ]);

    await testDb.insert(rolePermission).values([
      { roleId: readAndExportRole, permission: 'slis.export.generate' },
      { roleId: readAndExportRole, permission: 'slis.farmer.read' },
      { roleId: identityRole, permission: 'slis.identity.view' },
    ]);

    // National read & export, but identity.view ONLY on scheme A
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: officerId,
        roleId: readAndExportRole,
        module: 'slis',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: officerId,
        roleId: identityRole,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: schemeAId,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const encService = new EncryptionService();
    const ninA = '11111111111';
    const ninB = '22222222222';
    const farmerAId = crypto.randomUUID();
    const farmerBId = crypto.randomUUID();

    await testDb.insert(farmer).values([
      {
        id: farmerAId,
        schemeId: schemeAId,
        stateId: KANO_STATE_ID,
        farmerCode: `F-IDA-${Date.now()}`,
        firstName: 'AminaA',
        lastName: 'SchemeA',
        gender: 'female',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: farmerBId,
        schemeId: schemeBId,
        stateId: KANO_STATE_ID,
        farmerCode: `F-IDB-${Date.now()}`,
        firstName: 'AminaB',
        lastName: 'SchemeB',
        gender: 'female',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(farmerIdentity).values([
      {
        id: crypto.randomUUID(),
        farmerId: farmerAId,
        documentTypeId: DOC_TYPE_NIN,
        numberEnc: encService.encrypt(ninA).toString('hex'),
        numberHash: crypto.createHash('sha256').update(ninA).digest('hex'),
        numberLast4: '1111',
        uniquePerPerson: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        farmerId: farmerBId,
        documentTypeId: DOC_TYPE_NIN,
        numberEnc: encService.encrypt(ninB).toString('hex'),
        numberHash: crypto.createHash('sha256').update(ninB).digest('hex'),
        numberLast4: '2222',
        uniquePerPerson: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const exportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: exportId,
      userId: officerId,
      dataset: 'farmers',
      status: 'queued',
      filters: {},
    });

    const result = await processSlisExportJob({
      exportId,
      userId: officerId,
      dataset: 'farmers',
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    expect(result.status).toBe('completed');

    const fileBuf = mockStorageFiles.get(`exports/${exportId}.xlsx`)!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuf as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
    const ws = wb.getWorksheet('Data')!;

    let schemeAUnmasked = false;
    let schemeBMasked = false;

    for (let r = 2; r <= ws.rowCount; r++) {
      const code = ws.getRow(r).getCell(2).value?.toString();
      const idDoc = ws.getRow(r).getCell(10).value?.toString();
      if (code?.startsWith('F-IDA')) {
        expect(idDoc).toBe('11111111111');
        schemeAUnmasked = true;
      }
      if (code?.startsWith('F-IDB')) {
        expect(idDoc).toBe('***2222');
        schemeBMasked = true;
      }
    }

    expect(schemeAUnmasked).toBe(true);
    expect(schemeBMasked).toBe(true);
  });

  it('filters: export farmers with a status=approved filter -> only approved rows in the file', async () => {
    const filterUserId = crypto.randomUUID();
    const filterSchemeId = crypto.randomUUID();
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$fake';

    await testDb.insert(appUser).values({
      id: filterUserId,
      email: `filter_${Date.now()}@idmis.gov.ng`,
      fullName: 'Filter User',
      passwordHash: dummyHash,
    });

    await testDb.insert(organisation).values({
      id: filterSchemeId,
      type: 'scheme',
      code: `SCH-FLT-${Date.now()}`,
      name: 'Filter Scheme',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const filterRoleId = crypto.randomUUID();
    await testDb.insert(role).values({
      id: filterRoleId,
      key: `filter_role_${Date.now()}`,
      name: 'Filter Role',
      isSystem: false,
    });
    await testDb.insert(rolePermission).values([
      { roleId: filterRoleId, permission: 'slis.export.generate' },
      { roleId: filterRoleId, permission: 'slis.farmer.read' },
    ]);
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: filterUserId,
      roleId: filterRoleId,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: filterSchemeId,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const approvedFarmerId = crypto.randomUUID();
    const submittedFarmerId = crypto.randomUUID();

    await testDb.insert(farmer).values([
      {
        id: approvedFarmerId,
        schemeId: filterSchemeId,
        stateId: KANO_STATE_ID,
        farmerCode: `FLT-APP-${Date.now()}`,
        firstName: 'ApprovedFarmer',
        lastName: 'Test',
        gender: 'male',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: submittedFarmerId,
        schemeId: filterSchemeId,
        stateId: KANO_STATE_ID,
        farmerCode: `FLT-SUB-${Date.now()}`,
        firstName: 'SubmittedFarmer',
        lastName: 'Test',
        gender: 'female',
        status: 'submitted',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const exportId = crypto.randomUUID();
    await testDb.insert(exportJob).values({
      id: exportId,
      userId: filterUserId,
      dataset: 'farmers',
      status: 'queued',
      filters: { status: 'approved' },
    });

    const result = await processSlisExportJob({
      exportId,
      userId: filterUserId,
      dataset: 'farmers',
      filters: { status: 'approved' },
      dbClient: testDb as unknown as NonNullable<SlisExportJobOptions['dbClient']>,
      s3Client: mockS3Client as unknown as NonNullable<SlisExportJobOptions['s3Client']>,
    });

    expect(result.status).toBe('completed');

    const fileBuf = mockStorageFiles.get(`exports/${exportId}.xlsx`)!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuf as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
    const ws = wb.getWorksheet('Data')!;

    let hasApproved = false;
    let hasSubmitted = false;

    for (let r = 2; r <= ws.rowCount; r++) {
      const code = ws.getRow(r).getCell(2).value?.toString();
      if (code?.startsWith('FLT-APP')) hasApproved = true;
      if (code?.startsWith('FLT-SUB')) hasSubmitted = true;
    }

    expect(hasApproved).toBe(true);
    expect(hasSubmitted).toBe(false);
  });

  it('decrypt a value encrypted with an OLD key listed in ENCRYPTION_KEYS -> works', async () => {
    const oldKey = 'old-secret-key-must-be-min-32-chars-long';
    const newKey = 'new-secret-key-must-be-min-32-chars-long';

    // 1. Encrypt with old service (primary key 1 = oldKey)
    const oldService = new EncryptionService({
      encryptionKey: oldKey,
      nodeEnv: 'test',
    });
    const secretNIN = '98765432109';
    const ciphertextOld = oldService.encrypt(secretNIN);
    expect(ciphertextOld.readUInt8(0)).toBe(1);

    // 2. Service configured with new primary and old key in ENCRYPTION_KEYS ("1:oldKey")
    const rotatedService = new EncryptionService({
      encryptionKey: newKey,
      encryptionKeys: `1:${oldKey}`,
      nodeEnv: 'test',
    });

    // Successfully decrypts old value
    const decrypted = rotatedService.decrypt(ciphertextOld);
    expect(decrypted).toBe(secretNIN);
  });
});
