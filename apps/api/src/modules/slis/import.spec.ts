import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import ExcelJS from 'exceljs';
import {
  permissions,
  SLIS_IMPORT_DATASETS,
  SLIS_IMPORT_TEMPLATES,
  type SlisImportDataset,
} from '@idmis/contracts';
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
  farmer,
  farmerIdentity,
  plot,
  plotAllocation,
  season,
  feeBilling,
  feeCollection,
  waterRequest,
  training,
  trainingAttendance,
  cropProduction,
  lookupType,
  lookupValue,
  device,
  importRow,
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
import { AuthzService } from '../../platform/auth/authz.service';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

describe('SLIS Import Specification (BE-2.7)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let authzService: AuthzService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_slis_import_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test User IDs
  const ADMIN_USER_ID = crypto.randomUUID();
  const KANO_ADMIN_ID = crypto.randomUUID();
  const REVOKED_USER_ID = crypto.randomUUID();
  const SYSTEM_USER_ID = crypto.randomUUID();

  // Role IDs
  const SLIS_ADMIN_ROLE_ID = crypto.randomUUID();

  // Geography & Scheme IDs
  const KANO_STATE_ID = crypto.randomUUID();
  const LAGOS_STATE_ID = crypto.randomUUID();

  const KANO_SCHEME_ID = crypto.randomUUID();
  const KANO_SECTOR_ID = crypto.randomUUID();
  const LAGOS_SCHEME_ID = crypto.randomUUID();

  const KANO_LGA_ID = crypto.randomUUID();
  const KANO_WARD_ID = crypto.randomUUID();

  const SEASON_ID = crypto.randomUUID();
  const DEVICE_ID = crypto.randomUUID();

  let adminToken: string;
  let kanoAdminToken: string;
  let revokedUserToken: string;
  let revokedAssignmentId: string;

  const mockStorageFiles = new Map<string, Buffer>();

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
    authzService = app.get(AuthzService);

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
        id: ADMIN_USER_ID,
        email: 'admin@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'National Admin',
      },
      {
        id: KANO_ADMIN_ID,
        email: 'kano.admin@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'Kano Admin',
      },
      {
        id: REVOKED_USER_ID,
        email: 'revoked.user@idmis.gov.ng',
        passwordHash: dummyHash,
        fullName: 'Revoked Officer',
      },
    ]);

    // 4. Seed States & Organisations
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
        id: KANO_SECTOR_ID,
        parentId: KANO_SCHEME_ID,
        type: 'sector',
        code: 'SEC-A',
        name: 'Sector A',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        type: 'scheme',
        code: 'LGS',
        name: 'Lagos Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      {
        organisationId: KANO_SCHEME_ID,
        stateId: KANO_STATE_ID,
      },
      {
        organisationId: LAGOS_SCHEME_ID,
        stateId: LAGOS_STATE_ID,
      },
    ]);

    await testDb.insert(lga).values({
      id: KANO_LGA_ID,
      stateId: KANO_STATE_ID,
      code: 'KURA',
      name: 'Kura',
    });

    await testDb.insert(ward).values({
      id: KANO_WARD_ID,
      lgaId: KANO_LGA_ID,
      code: 'KURA-W-01',
      name: 'Kura Central Ward',
    });

    // 5. Seed Season
    await testDb.insert(season).values({
      id: SEASON_ID,
      schemeId: KANO_SCHEME_ID,
      name: 'Dry Season 2026',
      startsOn: '2026-01-01',
      endsOn: '2026-05-31',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 6. Seed Lookup Values
    const docTypeId = crypto.randomUUID();
    const cropTypeId = crypto.randomUUID();
    const tenureTypeId = crypto.randomUUID();
    const irrTypeId = crypto.randomUUID();

    await testDb.insert(lookupType).values([
      {
        id: docTypeId,
        key: 'document_type',
        name: 'Document Type',
        module: 'core',
        isSystem: true,
      },
      { id: cropTypeId, key: 'crop_type', name: 'Crop Type', module: 'slis', isSystem: true },
      { id: tenureTypeId, key: 'tenure', name: 'Tenure', module: 'slis', isSystem: true },
      {
        id: irrTypeId,
        key: 'irrigation_type',
        name: 'Irrigation Type',
        module: 'slis',
        isSystem: true,
      },
    ]);

    await testDb.insert(lookupValue).values([
      { id: crypto.randomUUID(), lookupTypeId: docTypeId, code: 'nin', label: 'NIN' },
      { id: crypto.randomUUID(), lookupTypeId: docTypeId, code: 'bvn', label: 'BVN' },
      { id: crypto.randomUUID(), lookupTypeId: cropTypeId, code: 'rice', label: 'Rice' },
      { id: crypto.randomUUID(), lookupTypeId: tenureTypeId, code: 'owner', label: 'Owner' },
      { id: crypto.randomUUID(), lookupTypeId: irrTypeId, code: 'gravity', label: 'Gravity' },
    ]);

    // 7. Seed Device for Sync Pull
    await testDb.insert(device).values({
      id: DEVICE_ID,
      installationId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      label: 'Test Tablet',
      platform: 'android',
      scopeFingerprint: 'national',
      registeredAt: new Date().toISOString(),
    });

    // 8. Seed Roles & Permissions
    await testDb.insert(role).values({
      id: SLIS_ADMIN_ROLE_ID,
      key: 'slis_admin',
      name: 'SLIS Administrator',
    });

    const allPerms = Object.values(permissions);
    await testDb.insert(rolePermission).values(
      allPerms.map((perm) => ({
        roleId: SLIS_ADMIN_ROLE_ID,
        permission: perm,
      })),
    );

    // Admin: national scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      roleId: SLIS_ADMIN_ROLE_ID,
      module: 'slis',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kano Admin: state scope
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_ADMIN_ID,
      roleId: SLIS_ADMIN_ROLE_ID,
      module: 'slis',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Revoked user: initially Kano scope
    revokedAssignmentId = crypto.randomUUID();
    await testDb.insert(assignment).values({
      id: revokedAssignmentId,
      userId: REVOKED_USER_ID,
      roleId: SLIS_ADMIN_ROLE_ID,
      module: 'slis',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 9. Generate Access Tokens
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
      userId: KANO_ADMIN_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kanoAdminToken = (await tokenService.createAccessToken(KANO_ADMIN_ID, sidKano)).accessToken;

    const sidRevoked = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidRevoked,
      familyId: crypto.randomUUID(),
      userId: REVOKED_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    revokedUserToken = (await tokenService.createAccessToken(REVOKED_USER_ID, sidRevoked))
      .accessToken;
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
    dataset: string,
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
    const cols = SLIS_IMPORT_TEMPLATES[dataset as SlisImportDataset] || [];
    sheet.columns = cols.map((c) => ({
      header: `${c.header}${c.required ? ' *' : ''}`,
      key: c.name,
    }));

    for (const r of rows) {
      sheet.addRow(r);
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async function uploadAndValidate(
    dataset: string,
    rows: Array<Record<string, unknown>>,
    token = adminToken,
    schemeId: string | null = KANO_SCHEME_ID,
    stateId: string | null = KANO_STATE_ID,
  ) {
    const buffer = await createTestWorkbook(dataset, rows);
    const fileId = crypto.randomUUID();
    mockStorageFiles.set(`files/${fileId}`, buffer);

    await testDb.insert(file).values({
      id: fileId,
      storageKey: `files/${fileId}`,
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
      headers: { authorization: `Bearer ${token}` },
      payload: { dataset, fileId, schemeId: schemeId ?? undefined, stateId: stateId ?? undefined },
    });
    expect(initRes.statusCode).toBe(201);
    const batch = JSON.parse(initRes.body);

    // Poll until validation finishes
    let validatedBatch = batch;
    for (let i = 0; i < 30; i++) {
      const getRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      validatedBatch = JSON.parse(getRes.body);
      if (validatedBatch.status === 'validated' || validatedBatch.status === 'validation_failed') {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return validatedBatch;
  }

  // --- 1. Templates ---
  describe('GET /imports/template/:dataset', () => {
    it('generates downloadable XLSX templates for all 7 SLIS datasets with correct metadata', async () => {
      for (const ds of SLIS_IMPORT_DATASETS) {
        const res = await app.inject({
          method: 'GET',
          url: `/imports/template/${ds}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(
          res.rawPayload as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
        );

        const meta = workbook.getWorksheet('_metadata');
        expect(meta).toBeDefined();
        expect(meta!.getCell('B1').value).toBe(1);
        expect(meta!.getCell('B2').value).toBe(ds);

        const dataSheet = workbook.getWorksheet('Data');
        expect(dataSheet).toBeDefined();
        expect(dataSheet!.rowCount).toBeGreaterThanOrEqual(2); // Header + example row
      }
    });
  });

  // --- 2. Round-trip Tests (All 7 Datasets) ---
  describe('SLIS Datasets Round-Trip: Template → Fill → Upload → Preview → Commit → Undo', () => {
    let createdFarmerId: string;

    it('1. slis.farmer: round-trips template to commit to undo (+ identity documents)', async () => {
      const rows = [
        {
          farmerCode: 'F-RT-001',
          firstName: 'Amina',
          lastName: 'Sani',
          otherNames: 'Gambo',
          gender: 'female',
          birthYear: 1990,
          phone: '+2348011223344',
          village: 'Kadawa',
          wardCode: 'KURA-W-01',
          sectorCode: 'SEC-A',
          documentTypeKey: 'nin',
          identityNumber: '11223344556',
          bankName: 'Zenith Bank',
        },
      ];

      const batch = await uploadAndValidate('slis.farmer', rows);
      expect(batch.status).toBe('validated');
      expect(batch.validRows).toBe(1);

      // Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.rows[0].status).toBe('valid');

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);
      const committed = JSON.parse(commitRes.body);
      expect(committed.status).toBe('committed');
      expect(committed.committedRows).toBe(1);

      // Verify farmer and identity row exist
      const [fRow] = await testDb
        .select()
        .from(farmer)
        .where(and(eq(farmer.farmerCode, 'F-RT-001'), isNull(farmer.deletedAt)));
      expect(fRow).toBeDefined();
      expect(fRow!.status).toBe('submitted'); // Imported records enter as submitted
      expect(fRow!.submittedBy).toBe(ADMIN_USER_ID);
      createdFarmerId = fRow!.id;

      const [idRow] = await testDb
        .select()
        .from(farmerIdentity)
        .where(and(eq(farmerIdentity.farmerId, createdFarmerId), isNull(farmerIdentity.deletedAt)));
      expect(idRow).toBeDefined();
      expect(idRow!.numberLast4).toBe('4556');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      const undone = JSON.parse(undoRes.body);
      expect(undone.status).toBe('undone');
      expect(undone.undoneRowsCount).toBe(1);

      // Verify soft-deleted
      const [fAfterUndo] = await testDb.select().from(farmer).where(eq(farmer.id, createdFarmerId));
      expect(fAfterUndo!.deletedAt).not.toBeNull();

      const [idAfterUndo] = await testDb
        .select()
        .from(farmerIdentity)
        .where(eq(farmerIdentity.farmerId, createdFarmerId));
      expect(idAfterUndo!.deletedAt).not.toBeNull();
    });

    it('2. slis.plot: round-trips with initial plot_allocation', async () => {
      // Re-create a farmer for allocation
      const [activeFarmer] = await testDb
        .insert(farmer)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          farmerCode: 'F-ALLOC-01',
          firstName: 'Sule',
          lastName: 'Danladi',
          gender: 'male',
          status: 'submitted',
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        })
        .returning();

      const rows = [
        {
          plotCode: 'P-RT-001',
          sectorCode: 'SEC-A',
          irrigationTypeKey: 'gravity',
          serviceType: 'improved',
          wardCode: 'KURA-W-01',
          areaHa: '2.5000',
          wktGeometry: 'POLYGON((8.50 11.80, 8.51 11.80, 8.51 11.81, 8.50 11.81, 8.50 11.80))',
          farmerCode: 'F-ALLOC-01',
          seasonName: 'Dry Season 2026',
          tenureKey: 'owner',
        },
      ];

      const batch = await uploadAndValidate('slis.plot', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [pRow] = await testDb
        .select()
        .from(plot)
        .where(and(eq(plot.plotCode, 'P-RT-001'), isNull(plot.deletedAt)));
      expect(pRow).toBeDefined();
      expect(pRow!.status).toBe('submitted');

      const [allocRow] = await testDb
        .select()
        .from(plotAllocation)
        .where(and(eq(plotAllocation.plotId, pRow!.id), isNull(plotAllocation.deletedAt)));
      expect(allocRow).toBeDefined();
      expect(allocRow!.farmerId).toBe(activeFarmer.id);

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [pAfter] = await testDb.select().from(plot).where(eq(plot.id, pRow!.id));
      expect(pAfter!.deletedAt).not.toBeNull();

      const [allocAfter] = await testDb
        .select()
        .from(plotAllocation)
        .where(eq(plotAllocation.id, allocRow!.id));
      expect(allocAfter!.deletedAt).not.toBeNull();
    });

    it('3. slis.fee_billing: round-trips billing record as status "billed"', async () => {
      const rows = [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-ALLOC-01',
          amountNgn: '15000.00',
          dueDate: '2026-05-15',
        },
      ];

      const batch = await uploadAndValidate('slis.fee_billing', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [bRow] = await testDb
        .select()
        .from(feeBilling)
        .where(and(eq(feeBilling.seasonId, SEASON_ID), isNull(feeBilling.deletedAt)));
      expect(bRow).toBeDefined();
      expect(bRow!.status).toBe('billed'); // Historical fee rows enter as billed
      expect(bRow!.amountNgn).toBe('15000.00');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [bAfter] = await testDb.select().from(feeBilling).where(eq(feeBilling.id, bRow!.id));
      expect(bAfter!.deletedAt).not.toBeNull();
    });

    it('4. slis.fee_collection: round-trips historical collection as status "recorded"', async () => {
      // Create a billing row for collection to reference
      const [f] = await testDb
        .select()
        .from(farmer)
        .where(eq(farmer.farmerCode, 'F-ALLOC-01'))
        .limit(1);

      const [billingRow] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: f.id,
          amountNgn: '20000.00',
          dueDate: '2026-05-15',
          status: 'billed',
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        })
        .returning();

      const rows = [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-ALLOC-01',
          receiptNo: 'REC-HIST-001',
          amountNgn: '10000.00',
          paidOn: '2026-03-25',
        },
      ];

      const batch = await uploadAndValidate('slis.fee_collection', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [colRow] = await testDb
        .select()
        .from(feeCollection)
        .where(and(eq(feeCollection.receiptNo, 'REC-HIST-001'), isNull(feeCollection.deletedAt)));
      expect(colRow).toBeDefined();
      expect(colRow!.status).toBe('recorded'); // Historical collections enter as recorded
      expect(colRow!.billingId).toBe(billingRow.id);
      expect(colRow!.amountNgn).toBe('10000.00');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [colAfter] = await testDb
        .select()
        .from(feeCollection)
        .where(eq(feeCollection.id, colRow!.id));
      expect(colAfter!.deletedAt).not.toBeNull();
    });

    it('5. slis.water_request: round-trips water request as status "submitted"', async () => {
      const rows = [
        {
          level: 'individual',
          targetCode: 'F-ALLOC-01',
          seasonName: 'Dry Season 2026',
          volumeM3: '3500.00',
          periodFromOn: '2026-02-01',
          periodToOn: '2026-02-28',
        },
      ];

      const batch = await uploadAndValidate('slis.water_request', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [wrRow] = await testDb
        .select()
        .from(waterRequest)
        .where(and(eq(waterRequest.seasonId, SEASON_ID), isNull(waterRequest.deletedAt)));
      expect(wrRow).toBeDefined();
      expect(wrRow!.status).toBe('submitted');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [wrAfter] = await testDb
        .select()
        .from(waterRequest)
        .where(eq(waterRequest.id, wrRow!.id));
      expect(wrAfter!.deletedAt).not.toBeNull();
    });

    it('6. slis.training: round-trips training and attendance as status "submitted"', async () => {
      const rows = [
        {
          topic: 'Modern Furrow Irrigation',
          tags: 'irrigation,maintenance',
          heldOn: '2026-03-12',
          venue: 'Sector A Shed',
          farmerCode: 'F-ALLOC-01',
          gender: 'male',
        },
      ];

      const batch = await uploadAndValidate('slis.training', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [tRow] = await testDb
        .select()
        .from(training)
        .where(and(eq(training.topic, 'Modern Furrow Irrigation'), isNull(training.deletedAt)));
      expect(tRow).toBeDefined();
      expect(tRow!.status).toBe('submitted');

      const [attRow] = await testDb
        .select()
        .from(trainingAttendance)
        .where(
          and(eq(trainingAttendance.trainingId, tRow!.id), isNull(trainingAttendance.deletedAt)),
        );
      expect(attRow).toBeDefined();

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [tAfter] = await testDb.select().from(training).where(eq(training.id, tRow!.id));
      expect(tAfter!.deletedAt).not.toBeNull();

      const [attAfter] = await testDb
        .select()
        .from(trainingAttendance)
        .where(eq(trainingAttendance.id, attRow!.id));
      expect(attAfter!.deletedAt).not.toBeNull();
    });

    it('7. slis.crop_production: round-trips crop production as status "submitted"', async () => {
      // Re-create plot for crop production
      const [testPlot] = await testDb
        .insert(plot)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          sectorId: KANO_SECTOR_ID,
          plotCode: 'P-CROP-01',
          areaHa: '3.0000',
          status: 'submitted',
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        })
        .returning();

      const rows = [
        {
          plotCode: 'P-CROP-01',
          seasonName: 'Dry Season 2026',
          cropTypeKey: 'rice',
          areaHa: '2.5000',
          yieldT: '6.200',
        },
      ];

      const batch = await uploadAndValidate('slis.crop_production', rows);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [cpRow] = await testDb
        .select()
        .from(cropProduction)
        .where(and(eq(cropProduction.plotId, testPlot.id), isNull(cropProduction.deletedAt)));
      expect(cpRow).toBeDefined();
      expect(cpRow!.status).toBe('submitted');

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [cpAfter] = await testDb
        .select()
        .from(cropProduction)
        .where(eq(cropProduction.id, cpRow!.id));
      expect(cpAfter!.deletedAt).not.toBeNull();
    });
  });

  // --- 3. Farmer Review Queue & Sync Pull Integration ---
  describe('Farmer Review Queue & Sync Pull Integration', () => {
    let syncFarmerId: string;
    let syncBatchId: string;

    it('committed farmer appears in review queue and in sync pull; after undo, pull shows delete ops', async () => {
      const rows = [
        {
          farmerCode: 'F-SYNC-001',
          firstName: 'Fatima',
          lastName: 'Umar',
          gender: 'female',
          birthYear: 1995,
          schemeCode: 'KRIS',
        },
      ];

      const batch = await uploadAndValidate('slis.farmer', rows);
      syncBatchId = batch.id;

      await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [f] = await testDb
        .select()
        .from(farmer)
        .where(and(eq(farmer.farmerCode, 'F-SYNC-001'), isNull(farmer.deletedAt)));
      expect(f).toBeDefined();
      syncFarmerId = f!.id;

      // 1. Verify farmer appears in Review Queue
      const queueRes = await app.inject({
        method: 'GET',
        url: '/slis/review/queue?entity=farmer',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(queueRes.statusCode).toBe(200);
      const queue = JSON.parse(queueRes.body);
      const inQueue = queue.items.find((item: { id: string }) => item.id === syncFarmerId);
      expect(inQueue).toBeDefined();
      expect(inQueue.status).toBe('submitted');

      // 2. Verify sync pull shows upsert for farmer
      const pullRes1 = await app.inject({
        method: 'GET',
        url: '/slis/sync/pull',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-device-id': DEVICE_ID,
        },
      });
      expect(pullRes1.statusCode).toBe(200);
      const pull1 = JSON.parse(pullRes1.body);
      const fOp = pull1.items.find(
        (op: { entity: string; recordId: string }) =>
          op.entity === 'farmer' && op.recordId === syncFarmerId,
      );
      expect(fOp).toBeDefined();
      expect(fOp.op).toBe('upsert');

      // 3. Undo import
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${syncBatchId}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      // 4. Verify sync pull shows delete op for farmer
      const pullRes2 = await app.inject({
        method: 'GET',
        url: `/slis/sync/pull?cursor=${pull1.nextCursor}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-device-id': DEVICE_ID,
        },
      });
      expect(pullRes2.statusCode).toBe(200);
      const pull2 = JSON.parse(pullRes2.body);
      const delOp = pull2.items.find(
        (op: { entity: string; recordId: string }) =>
          op.entity === 'farmer' && op.recordId === syncFarmerId,
      );
      expect(delOp).toBeDefined();
      expect(delOp.op).toBe('delete');
    });
  });

  // --- 4. Identity Security & Duplicates ---
  describe('Identity Protection & Duplicates', () => {
    it('never stores plaintext identity numbers in raw_data or parsed_data and flags duplicate NIN in file and vs DB', async () => {
      const plainNIN = '99887766554';

      const rows = [
        {
          farmerCode: 'F-ID-01',
          firstName: 'Musa',
          lastName: 'Garba',
          gender: 'male',
          documentTypeKey: 'nin',
          identityNumber: plainNIN,
          schemeCode: 'KRIS',
        },
        {
          farmerCode: 'F-ID-02',
          firstName: 'Isa',
          lastName: 'Garba',
          gender: 'male',
          documentTypeKey: 'nin',
          identityNumber: plainNIN, // Duplicate in same file
          schemeCode: 'KRIS',
        },
      ];

      const batch = await uploadAndValidate('slis.farmer', rows);
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorRows).toBe(1);

      // Verify NO import_row contains plainNIN in either raw_data or parsed_data JSON
      const dbRows = await testDb.select().from(importRow).where(eq(importRow.batchId, batch.id));

      for (const r of dbRows) {
        const rawStr = JSON.stringify(r.rawData);
        const parsedStr = JSON.stringify(r.parsedData);
        expect(rawStr).not.toContain(plainNIN);
        expect(parsedStr).not.toContain(plainNIN);
      }

      // Commit the single valid row to test DB duplicate check
      const validBatch = await uploadAndValidate('slis.farmer', [rows[0]]);
      expect(validBatch.status).toBe('validated');
      await app.inject({
        method: 'POST',
        url: `/imports/${validBatch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Try uploading the same NIN in another batch -> must be rejected against DB
      const dupBatch = await uploadAndValidate('slis.farmer', [
        {
          farmerCode: 'F-ID-03',
          firstName: 'Yakubu',
          lastName: 'Sani',
          gender: 'male',
          documentTypeKey: 'nin',
          identityNumber: plainNIN,
          schemeCode: 'KRIS',
        },
      ]);
      expect(dupBatch.status).toBe('validation_failed');
      expect(dupBatch.errorRows).toBe(1);
    });
  });

  // --- 5. Fees Business Rules ---
  describe('Fees Import Rules & Exact Amount Storage', () => {
    it('rejects duplicate receipt_no, collections over billed amount, and collections with missing billing', async () => {
      // 1. Missing billing rejection
      const noBillingBatch = await uploadAndValidate('slis.fee_collection', [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-NON-EXISTENT',
          receiptNo: 'REC-DUP-01',
          amountNgn: '5000.00',
          paidOn: '2026-03-25',
        },
      ]);
      expect(noBillingBatch.status).toBe('validation_failed');
      expect(noBillingBatch.errorRows).toBe(1);

      // 2. Exact amount storage & collections over billed amount
      // Create a dedicated farmer and billing row
      const [feeFarmer] = await testDb
        .insert(farmer)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          farmerCode: 'F-FEE-TEST-01',
          firstName: 'Fee',
          lastName: 'Tester',
          gender: 'female',
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        })
        .returning();

      const [billing] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: feeFarmer.id,
          amountNgn: '1234.50',
          dueDate: '2026-05-15',
          status: 'billed',
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        })
        .returning();

      expect(billing.amountNgn).toBe('1234.50');

      // Collection exceeding billed amount (e.g. 1500.00 > 1234.50)
      const overBatch = await uploadAndValidate('slis.fee_collection', [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-FEE-TEST-01',
          receiptNo: 'REC-OVER-01',
          amountNgn: '1500.00',
          paidOn: '2026-03-25',
        },
      ]);
      expect(overBatch.status).toBe('validation_failed');
      expect(overBatch.errorRows).toBe(1);

      // Valid collection of exact amount 1234.50
      const validColBatch = await uploadAndValidate('slis.fee_collection', [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-FEE-TEST-01',
          receiptNo: 'REC-EXACT-01',
          amountNgn: '1234.50',
          paidOn: '2026-03-25',
        },
      ]);
      expect(validColBatch.status).toBe('validated');
      await app.inject({
        method: 'POST',
        url: `/imports/${validColBatch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [storedCol] = await testDb
        .select()
        .from(feeCollection)
        .where(eq(feeCollection.receiptNo, 'REC-EXACT-01'));
      expect(storedCol.amountNgn).toBe('1234.50');

      // Duplicate receipt_no vs DB
      const dupReceiptBatch = await uploadAndValidate('slis.fee_collection', [
        {
          seasonName: 'Dry Season 2026',
          targetType: 'farmer',
          targetCode: 'F-FEE-TEST-01',
          receiptNo: 'REC-EXACT-01', // Already exists
          amountNgn: '100.00',
          paidOn: '2026-03-26',
        },
      ]);
      expect(dupReceiptBatch.status).toBe('validation_failed');
      expect(dupReceiptBatch.errorRows).toBe(1);
    });
  });

  // --- 6. Scope Security at Two Gates ---
  describe('Scope Security at Two Gates', () => {
    it('Gate 1: Kano admin importing a Lagos row gets preview out_of_scope error', async () => {
      const rows = [
        {
          farmerCode: 'F-LAGOS-01',
          firstName: 'Babatunde',
          lastName: 'Fashola',
          gender: 'male',
          schemeCode: 'LGS', // Lagos Scheme!
        },
      ];

      const batch = await uploadAndValidate(
        'slis.farmer',
        rows,
        kanoAdminToken,
        KANO_SCHEME_ID,
        KANO_STATE_ID,
      );
      expect(batch.status).toBe('validation_failed');
      expect(batch.errorRows).toBe(1);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${kanoAdminToken}` },
      });
      const preview = JSON.parse(previewRes.body);
      expect(preview.rows[0].errors[0].message).toContain('outside your assigned scope');
    });

    it('Gate 2: user scope revoked between preview and commit fails the commit and writes nothing', async () => {
      const rows = [
        {
          farmerCode: 'F-REVOKE-01',
          firstName: 'Kabiru',
          lastName: 'Shehu',
          gender: 'male',
          schemeCode: 'KRIS',
        },
      ];

      // Upload and validate while user has Kano scope
      const batch = await uploadAndValidate(
        'slis.farmer',
        rows,
        revokedUserToken,
        KANO_SCHEME_ID,
        KANO_STATE_ID,
      );
      expect(batch.status).toBe('validated');
      expect(batch.validRows).toBe(1);

      // Now revoke user scope by deleting their assignment before commit
      await testDb.delete(assignment).where(eq(assignment.id, revokedAssignmentId));
      await authzService.invalidateUser(REVOKED_USER_ID);

      // Attempt to commit with revoked scope
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${revokedUserToken}` },
      });
      expect(commitRes.statusCode).toBe(403);

      // Verify farmer row was NOT written to database
      const [f] = await testDb.select().from(farmer).where(eq(farmer.farmerCode, 'F-REVOKE-01'));
      expect(f).toBeUndefined();
    });
  });

  // --- 7. Undo Skip & Safety Rules ---
  describe('Undo Safety Rules', () => {
    it('skips undo if record was modified after import (undo_skipped_modified), preserving edits', async () => {
      const rows = [
        {
          farmerCode: 'F-EDIT-01',
          firstName: 'Hamza',
          lastName: 'Musa',
          gender: 'male',
          schemeCode: 'KRIS',
        },
      ];

      const batch = await uploadAndValidate('slis.farmer', rows);
      await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [f] = await testDb.select().from(farmer).where(eq(farmer.farmerCode, 'F-EDIT-01'));
      expect(f).toBeDefined();

      // Simulate record edited after import (bump version to 2)
      await testDb
        .update(farmer)
        .set({ firstName: 'Hamza Edited', version: 2 })
        .where(eq(farmer.id, f.id));

      // Try undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      const undoBody = JSON.parse(undoRes.body);
      expect(undoBody.skippedRowsCount).toBe(1);
      expect(undoBody.skippedRows[0].reason).toContain('undo_skipped_modified');

      // The record is preserved in DB and not deleted
      const [fPreserved] = await testDb.select().from(farmer).where(eq(farmer.id, f.id));
      expect(fPreserved.deletedAt).toBeNull();
      expect(fPreserved.firstName).toBe('Hamza Edited');
    });

    it('refuses undo for records already approved', async () => {
      const rows = [
        {
          farmerCode: 'F-APPR-01',
          firstName: 'Halima',
          lastName: 'Adamu',
          gender: 'female',
          schemeCode: 'KRIS',
        },
      ];

      const batch = await uploadAndValidate('slis.farmer', rows);
      await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [f] = await testDb.select().from(farmer).where(eq(farmer.farmerCode, 'F-APPR-01'));

      // Mark record as approved
      await testDb.update(farmer).set({ status: 'approved' }).where(eq(farmer.id, f.id));

      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      const undoBody = JSON.parse(undoRes.body);
      expect(undoBody.skippedRowsCount).toBe(1);
      expect(undoBody.skippedRows[0].reason).toContain('approved');
    });
  });

  // --- 8. Plot Boundary Geometry Validation ---
  describe('Plot Geometry Validation', () => {
    it('accepts valid WKT and GeoJSON, but rejects invalid geometry', async () => {
      const rows = [
        {
          plotCode: 'P-GEOM-01',
          sectorCode: 'SEC-A',
          wktGeometry: 'POLYGON((8.50 11.80, 8.51 11.80, 8.51 11.81, 8.50 11.81, 8.50 11.80))',
        },
        {
          plotCode: 'P-GEOM-02',
          sectorCode: 'SEC-A',
          wktGeometry: JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [8.5, 11.8],
                [8.51, 11.8],
                [8.51, 11.81],
                [8.5, 11.81],
                [8.5, 11.8],
              ],
            ],
          }),
        },
        {
          plotCode: 'P-GEOM-03',
          sectorCode: 'SEC-A',
          wktGeometry: 'INVALID_NOT_A_GEOMETRY',
        },
      ];

      const batch = await uploadAndValidate('slis.plot', rows);
      expect(batch.status).toBe('validation_failed');
      expect(batch.validRows).toBe(2);
      expect(batch.errorRows).toBe(1);

      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const preview = JSON.parse(previewRes.body);
      const invalidRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 4);
      expect(invalidRow.errors[0].code).toBe('invalid_geometry');
    });
  });
});
