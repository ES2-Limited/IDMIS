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
  lookupType,
  lookupValue,
  organisation,
  role,
  rolePermission,
  exportJob,
  state,
  eq,
  postgres,
  drizzle,
  migrate,
} from '@idmis/db';
import * as schema from '@idmis/db';
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
    const key = crypto
      .createHash('sha256')
      .update(process.env.ENCRYPTION_KEY || 'development-test-encryption-key-32-chars')
      .digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(rawNin, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const numEnc = Buffer.concat([Buffer.from([1]), iv, tag, encrypted]).toString('hex');

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

  it('fails job when scope is revoked between enqueue and run', async () => {
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
  });
});
