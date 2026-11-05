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
  organisation,
  lookupType,
  lookupValue,
  basin,
  station,
  reservoir,
  dam,
  file,
  importBatch,
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
import { ProblemDetailsFilter } from '../../platform/filters/problem-details.filter';
import { initAuditWriter } from '../../platform/audit/audit-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BLIS Assets Management — Basin, Morphometry, Station, Reservoir, Dam (BE-4.2)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_blis_asset_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Users
  const SYSTEM_USER_ID = crypto.randomUUID();
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const HJ_OFFICER_ID = crypto.randomUUID();
  const CHAD_OFFICER_ID = crypto.randomUUID();

  // Roles
  const NATIONAL_ROLE_ID = crypto.randomUUID();
  const BASIN_OFFICER_ROLE_ID = crypto.randomUUID();

  // RBDAs
  const HJ_RBDA_ID = crypto.randomUUID();
  const CHAD_RBDA_ID = crypto.randomUUID();

  // Lookups
  const ST_DISCHARGE_ID = crypto.randomUUID();
  const PURPOSE_IRR_ID = crypto.randomUUID();
  const CAT_MAJOR_ID = crypto.randomUUID();
  const HAZARD_HIGH_ID = crypto.randomUUID();

  // Tokens
  let nationalToken: string;
  let hjOfficerToken: string;
  let chadOfficerToken: string;

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
    storageService = app.get(StorageService);

    storageService.getObjectBuffer = async (storageKey: string) => {
      const buf = mockStorageFiles.get(storageKey);
      if (!buf) throw new Error(`Mock storage file not found: ${storageKey}`);
      return buf;
    };

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
        id: HJ_OFFICER_ID,
        email: 'hj.officer@idmis.gov.ng',
        fullName: 'HJ Basin Officer',
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

    // 5. Seed Roles and Permissions
    await testDb.insert(role).values([
      {
        id: NATIONAL_ROLE_ID,
        key: 'national_blis_admin',
        name: 'National BLIS Admin',
        isSystem: false,
      },
      {
        id: BASIN_OFFICER_ROLE_ID,
        key: 'test_basin_officer',
        name: 'Test Basin Officer',
        isSystem: false,
      },
    ]);

    const allBlisPermissions = [
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_BASIN_MANAGE,
      permissions.BLIS_STATION_MANAGE,
      permissions.BLIS_DAM_MANAGE,
      permissions.CORE_IMPORT_RUN,
      permissions.CORE_FILE_UPLOAD,
      permissions.CORE_FILE_READ,
    ];

    await testDb.insert(rolePermission).values([
      ...allBlisPermissions.map((p) => ({
        roleId: NATIONAL_ROLE_ID,
        permission: p,
      })),
      ...allBlisPermissions.map((p) => ({
        roleId: BASIN_OFFICER_ROLE_ID,
        permission: p,
      })),
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
        userId: HJ_OFFICER_ID,
        roleId: BASIN_OFFICER_ROLE_ID,
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
        roleId: BASIN_OFFICER_ROLE_ID,
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
    const [ltStation] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'station_type',
        name: 'Station Type',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    await testDb.insert(lookupValue).values({
      id: ST_DISCHARGE_ID,
      lookupTypeId: ltStation.id,
      code: 'discharge',
      label: 'River Discharge',
      sortOrder: 1,
    });

    const [ltDamPurpose] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'dam_purpose',
        name: 'Dam Purpose',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    await testDb.insert(lookupValue).values({
      id: PURPOSE_IRR_ID,
      lookupTypeId: ltDamPurpose.id,
      code: 'irrigation',
      label: 'Irrigation',
      sortOrder: 1,
    });

    const [ltDamCat] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'dam_category',
        name: 'Dam Category',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    await testDb.insert(lookupValue).values({
      id: CAT_MAJOR_ID,
      lookupTypeId: ltDamCat.id,
      code: 'major',
      label: 'Major Dam',
      sortOrder: 1,
    });

    const [ltHazard] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'hazard_class',
        name: 'Hazard Class',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    await testDb.insert(lookupValue).values({
      id: HAZARD_HIGH_ID,
      lookupTypeId: ltHazard.id,
      code: 'high',
      label: 'High Hazard',
      sortOrder: 1,
    });

    // 8. Generate Tokens
    async function createToken(userId: string) {
      const sessId = crypto.randomUUID();
      const famId = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sessId,
        familyId: famId,
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: now,
      });
      const { accessToken } = await tokenService.createAccessToken(userId, sessId);
      return accessToken;
    }

    nationalToken = await createToken(NATIONAL_ADMIN_ID);
    hjOfficerToken = await createToken(HJ_OFFICER_ID);
    chadOfficerToken = await createToken(CHAD_OFFICER_ID);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  // Shared IDs for cross-asset tests
  let createdBasinId: string;
  let createdBasinVersion: number;
  let createdStationId: string;
  let createdStationVersion: number;
  let createdReservoirId: string;
  let createdReservoirVersion: number;
  let createdDamId: string;
  let createdDamVersion: number;
  let createdMorphometryId: string;
  let createdMorphometryVersion: number;

  async function createImportExcel(dataset: string, rows: Record<string, unknown>[]) {
    const workbook = new ExcelJS.Workbook();
    workbook.description = JSON.stringify({ dataset, version: 1 });
    workbook.keywords = `templateVersion:1;dataset:${dataset}`;
    workbook.subject = '1';
    const metaSheet = workbook.addWorksheet('_metadata');
    metaSheet.state = 'veryHidden';
    metaSheet.getCell('A1').value = 'template_version';
    metaSheet.getCell('B1').value = 1;

    const sheet = workbook.addWorksheet('Data');

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      sheet.addRow(headers);
      for (const row of rows) {
        sheet.addRow(headers.map((h) => row[h]));
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileId = crypto.randomUUID();
    const storageKey = `imports/${fileId}.xlsx`;
    mockStorageFiles.set(storageKey, buffer);

    await testDb.insert(file).values({
      id: fileId,
      storageKey,
      originalName: `${dataset}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: buffer.byteLength,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      scanStatus: 'clean',
      createdAt: new Date().toISOString(),
      createdBy: SYSTEM_USER_ID,
      updatedAt: new Date().toISOString(),
      updatedBy: SYSTEM_USER_ID,
    });

    return fileId;
  }

  async function pollBatch(batchId: string, token: string) {
    let b: {
      id: string;
      status: string;
      totalRows: number;
      validRows: number;
      errorRows: number;
    } = {
      id: batchId,
      status: 'pending',
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
    };
    for (let i = 0; i < 40; i++) {
      const getRes = await app.inject({
        method: 'GET',
        url: `/imports/${batchId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      b = JSON.parse(getRes.payload) as {
        id: string;
        status: string;
        totalRows: number;
        validRows: number;
        errorRows: number;
      };
      if (b.status === 'validated' || b.status === 'validation_failed') {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return b;
  }

  describe('1. Basin CRUD, Geometry Formats, and RBDA Scoping', () => {
    it('creates a basin within assigned RBDA using GeoJSON geometry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'HJRB',
          name: 'Hadejia-Jamaare River Basin',
          altName: 'HJRB',
          hydrologicalUnit: 'HU-8',
          mainRiver: 'Hadejia',
          rbdaId: HJ_RBDA_ID,
          geom: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [8.5, 11.5],
                  [8.6, 11.5],
                  [8.6, 11.6],
                  [8.5, 11.6],
                  [8.5, 11.5],
                ],
              ],
            ],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.code).toBe('HJRB');
      expect(body.rbdaId).toBe(HJ_RBDA_ID);
      expect(body.geom).toBeDefined();
      expect(body.geom.type).toBe('MultiPolygon');

      createdBasinId = body.id;
      createdBasinVersion = body.version;
    });

    it('creates a basin in Chad Basin as Chad officer using GeoJSON geometry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${chadOfficerToken}` },
        payload: {
          code: 'CB',
          name: 'Chad Basin',
          rbdaId: CHAD_RBDA_ID,
          geom: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [12.5, 11.5],
                  [12.6, 11.5],
                  [12.6, 11.6],
                  [12.5, 11.6],
                  [12.5, 11.5],
                ],
              ],
            ],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('CB');
    });

    it('rejects basin creation for another RBDA (HJ officer trying to create in Chad RBDA -> 404)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ILLEGAL_BASIN',
          name: 'Illegal Basin',
          rbdaId: CHAD_RBDA_ID,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('creates a national-only basin (null rbda_id) as national admin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: {
          code: 'NAT_BASIN',
          name: 'National Lake Basin',
          rbdaId: null,
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it('rejects creation of national-only basin by an RBDA officer -> 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'NAT_BASIN_FAIL',
          name: 'Officer trying national basin',
          rbdaId: null,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('gets a basin within assigned RBDA -> 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/basins/${createdBasinId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(createdBasinId);
    });

    it('rejects viewing a basin in another RBDA (HJ officer viewing Chad Basin -> 404)', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'GET',
        url: `/blis/basins/${chadBasin.id}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('updates a basin within scope and verifies optimistic concurrency', async () => {
      // 1. Update with correct version
      const res = await app.inject({
        method: 'PUT',
        url: `/blis/basins/${createdBasinId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdBasinVersion,
          name: 'Hadejia-Jamaare River Basin Updated',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('Hadejia-Jamaare River Basin Updated');
      expect(body.version).toBe(createdBasinVersion + 1);
      createdBasinVersion = body.version;

      // 2. Update with stale version -> 409
      const staleRes = await app.inject({
        method: 'PUT',
        url: `/blis/basins/${createdBasinId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdBasinVersion - 1,
          name: 'Stale update',
        },
      });

      expect(staleRes.statusCode).toBe(409);
    });

    it('rejects update of a basin in another RBDA (HJ officer updating Chad Basin -> 404)', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'PUT',
        url: `/blis/basins/${chadBasin.id}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: chadBasin.version,
          name: 'Attempted cross-rbda rename',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('2. Basin Morphometry CRUD and Scoping', () => {
    it('creates basin morphometry for a basin in scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basin-morphometry',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          basinId: createdBasinId,
          measuredOn: '2026-05-01',
          lowestPointM: '310.50',
          highestPointM: '1250.00',
          avgSlopePct: '4.250',
          streamCount: 42,
          lengthKm: '350.200',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.basinId).toBe(createdBasinId);
      expect(body.streamCount).toBe(42);

      createdMorphometryId = body.id;
      createdMorphometryVersion = body.version;
    });

    it('rejects morphometry creation for basin in another RBDA -> 404', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/basin-morphometry',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          basinId: chadBasin.id,
          measuredOn: '2026-05-01',
          lowestPointM: '200.00',
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('gets morphometry record in scope -> 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/basin-morphometry/${createdMorphometryId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(createdMorphometryId);
    });

    it('updates morphometry record in scope', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/blis/basin-morphometry/${createdMorphometryId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdMorphometryVersion,
          streamCount: 45,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.streamCount).toBe(45);
      expect(body.version).toBe(createdMorphometryVersion + 1);
      createdMorphometryVersion = body.version;
    });
  });

  describe('3. Station CRUD, Geometry Formats, and Scoping', () => {
    it('creates a station with GeoJSON Point geometry in scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-WUDIL',
          name: 'Wudil Gauge Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          river: 'Hadejia',
          geom: { type: 'Point', coordinates: [8.85, 11.8] },
          installedOn: '2021-03-10',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.code).toBe('ST-WUDIL');
      expect(body.geom.type).toBe('Point');
      expect(body.geom.coordinates).toEqual([8.85, 11.8]);

      createdStationId = body.id;
      createdStationVersion = body.version;
    });

    it('creates another station with GeoJSON Point format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-GAYA',
          name: 'Gaya Gauge Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: [8.9, 11.85] },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('ST-GAYA');
    });

    it('rejects station creation for a basin in another RBDA -> 404', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-CROSS-FAIL',
          name: 'Illegal Cross Station',
          basinId: chadBasin.id,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: [12.5, 11.5] },
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('gets station in scope and lists stations', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/blis/stations/${createdStationId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);

      const listRes = await app.inject({
        method: 'GET',
        url: `/blis/stations?basinId=${createdBasinId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('updates a station in scope and enforces optimistic concurrency', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/blis/stations/${createdStationId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdStationVersion,
          name: 'Wudil Gauge Station Updated',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('Wudil Gauge Station Updated');
      expect(body.version).toBe(createdStationVersion + 1);
      createdStationVersion = body.version;

      // Stale version -> 409
      const staleRes = await app.inject({
        method: 'PUT',
        url: `/blis/stations/${createdStationId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdStationVersion - 1,
          name: 'Stale Station',
        },
      });
      expect(staleRes.statusCode).toBe(409);
    });
  });

  describe('4. Reservoir CRUD and Scoping', () => {
    it('creates a reservoir in scope with geometry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/reservoirs',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          basinId: createdBasinId,
          name: 'Tiga Reservoir',
          river: 'Kano River',
          areaKm2: '178.000',
          volumeMcm: '1874.000',
          geom: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [8.55, 11.4],
                  [8.65, 11.4],
                  [8.65, 11.5],
                  [8.55, 11.5],
                  [8.55, 11.4],
                ],
              ],
            ],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Tiga Reservoir');
      expect(body.geom.type).toBe('MultiPolygon');

      createdReservoirId = body.id;
      createdReservoirVersion = body.version;
    });

    it('rejects reservoir creation in another RBDA basin -> 404', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/reservoirs',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          basinId: chadBasin.id,
          name: 'Chad Reservoir Illegal',
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('updates reservoir in scope', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/blis/reservoirs/${createdReservoirId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdReservoirVersion,
          volumeMcm: '1875.500',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.volumeMcm).toBe('1875.500');
      expect(body.version).toBe(createdReservoirVersion + 1);
      createdReservoirVersion = body.version;
    });
  });

  describe('5. Dam CRUD and Scoping', () => {
    it('creates a dam in scope linked to basin and reservoir', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/dams',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          name: 'Tiga Dam',
          code: 'DAM-TIGA',
          basinId: createdBasinId,
          reservoirId: createdReservoirId,
          purposeId: PURPOSE_IRR_ID,
          categoryId: CAT_MAJOR_ID,
          completionYear: 1974,
          crestLengthM: '6000.00',
          heightM: '48.00',
          reservoirCapacityMcm: '1874.000',
          geom: { type: 'Point', coordinates: [8.6, 11.45] },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Tiga Dam');
      expect(body.geom.type).toBe('Point');
      expect(body.completionYear).toBe(1974);

      createdDamId = body.id;
      createdDamVersion = body.version;
    });

    it('rejects dam creation for basin in another RBDA -> 404', async () => {
      const [chadBasin] = await testDb.select().from(basin).where(eq(basin.code, 'CB')).limit(1);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/dams',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          name: 'Cross Dam Illegal',
          basinId: chadBasin.id,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('gets and updates dam in scope', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: `/blis/dams/${createdDamId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/blis/dams/${createdDamId}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          version: createdDamVersion,
          heightM: '48.50',
        },
      });
      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.payload);
      expect(body.heightM).toBe('48.50');
      expect(body.version).toBe(createdDamVersion + 1);
      createdDamVersion = body.version;
    });

    it('deletes dam, reservoir, station, morphometry with optimistic concurrency check', async () => {
      // 1. Delete dam
      const damDel = await app.inject({
        method: 'DELETE',
        url: `/blis/dams/${createdDamId}?version=${createdDamVersion}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(damDel.statusCode).toBe(200);

      // 2. Delete reservoir
      const resDel = await app.inject({
        method: 'DELETE',
        url: `/blis/reservoirs/${createdReservoirId}?version=${createdReservoirVersion}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(resDel.statusCode).toBe(200);

      // 3. Delete station
      const stDel = await app.inject({
        method: 'DELETE',
        url: `/blis/stations/${createdStationId}?version=${createdStationVersion}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(stDel.statusCode).toBe(200);

      // 4. Delete morphometry
      const morphDel = await app.inject({
        method: 'DELETE',
        url: `/blis/basin-morphometry/${createdMorphometryId}?version=${createdMorphometryVersion}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(morphDel.statusCode).toBe(200);

      // 5. Delete basin
      const basinDel = await app.inject({
        method: 'DELETE',
        url: `/blis/basins/${createdBasinId}?version=${createdBasinVersion}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(basinDel.statusCode).toBe(200);
    });
  });

  describe('6. BLIS Import Handlers — Valid Files, RBDA Scoping & Undo', () => {
    it('imports blis.basin: succeeds for valid in-scope rows, rejects out-of-scope rows, and supports undo', async () => {
      // 1. Out-of-scope file
      const outOfScopeFileId = await createImportExcel('blis.basin', [
        {
          code: 'IMPORT-CHAD-1',
          name: 'Imported Chad Basin',
          altName: 'ICB',
          hydrologicalUnit: 'HU-2',
          mainRiver: 'Yobe',
          rbdaCode: 'CHADRBDA',
        },
      ]);

      const uploadRes1 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: outOfScopeFileId, dataset: 'blis.basin', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes1.statusCode).toBe(201);
      const batch1 = await pollBatch(JSON.parse(uploadRes1.payload).id, hjOfficerToken);
      expect(batch1.totalRows).toBe(1);
      expect(batch1.errorRows).toBe(1);
      expect(batch1.status).toBe('validation_failed');

      // Verify preview shows out_of_scope error
      const previewRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch1.id}/preview?limit=10`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.payload);
      expect(preview.rows[0].errors[0].code).toBe('out_of_scope');

      // 2. Valid file
      const validFileId = await createImportExcel('blis.basin', [
        {
          code: 'IMPORT-HJ-1',
          name: 'Imported HJ Basin',
          altName: 'IHJ',
          hydrologicalUnit: 'HU-1',
          mainRiver: 'Hadejia',
          rbdaCode: 'HJRBDA',
          geomWkt: 'MULTIPOLYGON(((8.5 11.5, 8.6 11.5, 8.6 11.6, 8.5 11.6, 8.5 11.5)))',
        },
      ]);

      const uploadRes2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: validFileId, dataset: 'blis.basin', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes2.statusCode).toBe(201);
      const batch2 = await pollBatch(JSON.parse(uploadRes2.payload).id, hjOfficerToken);
      expect(batch2.totalRows).toBe(1);
      expect(batch2.validRows).toBe(1);
      expect(batch2.status).toBe('validated');

      // Commit valid row
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/commit`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);
      const commitBody = JSON.parse(commitRes.payload);
      expect(commitBody.status).toBe('committed');

      // Check basin exists in database
      const [importedBasin] = await testDb
        .select()
        .from(basin)
        .where(eq(basin.code, 'IMPORT-HJ-1'))
        .limit(1);
      expect(importedBasin).toBeDefined();
      expect(importedBasin.name).toBe('Imported HJ Basin');

      // Undo import
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/undo`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      // Check basin is soft deleted
      const [undoneBasin] = await testDb
        .select()
        .from(basin)
        .where(and(eq(basin.code, 'IMPORT-HJ-1'), isNull(basin.deletedAt)))
        .limit(1);
      expect(undoneBasin).toBeUndefined();
    });

    it('imports blis.station: succeeds in-scope, rejects out-of-scope, supports undo', async () => {
      // Create a persistent HJ basin and Chad basin for station import test
      await testDb.insert(basin).values({
        id: crypto.randomUUID(),
        code: 'HJ-BASE-ST',
        name: 'HJ Base Basin for Station',
        rbdaId: HJ_RBDA_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(basin).values({
        id: crypto.randomUUID(),
        code: 'CHAD-BASE-ST',
        name: 'Chad Base Basin for Station',
        rbdaId: CHAD_RBDA_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // 1. Out-of-scope file
      const outOfScopeFileId = await createImportExcel('blis.station', [
        {
          code: 'ST-IMP-CHAD',
          name: 'Imported Chad Gauge',
          basinCode: 'CHAD-BASE-ST',
          stationTypeCode: 'discharge',
          geomWkt: 'POINT(12.85 11.80)',
        },
      ]);

      const uploadRes1 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: outOfScopeFileId, dataset: 'blis.station', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes1.statusCode).toBe(201);
      const batch1 = await pollBatch(JSON.parse(uploadRes1.payload).id, hjOfficerToken);
      expect(batch1.errorRows).toBe(1);
      expect(batch1.status).toBe('validation_failed');

      // 2. Valid in-scope file
      const validFileId = await createImportExcel('blis.station', [
        {
          code: 'ST-IMP-1',
          name: 'Imported Gauge 1',
          basinCode: 'HJ-BASE-ST',
          stationTypeCode: 'discharge',
          geomWkt: 'POINT(8.85 11.80)',
        },
      ]);

      const uploadRes2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: validFileId, dataset: 'blis.station', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes2.statusCode).toBe(201);
      const batch2 = await pollBatch(JSON.parse(uploadRes2.payload).id, hjOfficerToken);
      expect(batch2.validRows).toBe(1);
      expect(batch2.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/commit`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [st] = await testDb.select().from(station).where(eq(station.code, 'ST-IMP-1')).limit(1);
      expect(st).toBeDefined();

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/undo`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [undoneSt] = await testDb
        .select()
        .from(station)
        .where(and(eq(station.code, 'ST-IMP-1'), isNull(station.deletedAt)))
        .limit(1);
      expect(undoneSt).toBeUndefined();
    });

    it('imports blis.dam: succeeds in-scope, rejects out-of-scope, supports undo', async () => {
      // 1. Out-of-scope file
      const outOfScopeFileId = await createImportExcel('blis.dam', [
        {
          name: 'Imported Chad Dam',
          basinCode: 'CHAD-BASE-ST',
          damPurposeCode: 'irrigation',
          geomWkt: 'POINT(12.85 11.80)',
        },
      ]);

      const uploadRes1 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: outOfScopeFileId, dataset: 'blis.dam', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes1.statusCode).toBe(201);
      const batch1 = await pollBatch(JSON.parse(uploadRes1.payload).id, hjOfficerToken);
      expect(batch1.errorRows).toBe(1);
      expect(batch1.status).toBe('validation_failed');

      // 2. Valid file
      const validFileId = await createImportExcel('blis.dam', [
        {
          name: 'Imported Tiga Secondary Dam',
          basinCode: 'HJ-BASE-ST',
          reservoirName: 'Imported Tiga Res',
          damPurposeCode: 'irrigation',
          damCategoryCode: 'major',
          yearCompleted: 1980,
          crestLengthM: '1200.00',
          heightM: '25.00',
          storageCapacityMcm: '500.00',
          geomWkt: 'POINT(8.60 11.45)',
        },
      ]);

      const uploadRes2 = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: { fileId: validFileId, dataset: 'blis.dam', rbdaId: HJ_RBDA_ID },
      });
      expect(uploadRes2.statusCode).toBe(201);
      const batch2 = await pollBatch(JSON.parse(uploadRes2.payload).id, hjOfficerToken);
      expect(batch2.validRows).toBe(1);
      expect(batch2.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/commit`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(201);

      const [createdDamRow] = await testDb
        .select()
        .from(dam)
        .where(eq(dam.name, 'Imported Tiga Secondary Dam'))
        .limit(1);
      expect(createdDamRow).toBeDefined();
      expect(createdDamRow.completionYear).toBe(1980);

      // Verify reservoir was auto-created from reservoirName
      const [autoRes] = await testDb
        .select()
        .from(reservoir)
        .where(eq(reservoir.name, 'Imported Tiga Res'))
        .limit(1);
      expect(autoRes).toBeDefined();

      // Undo
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch2.id}/undo`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(undoRes.statusCode).toBe(201);

      const [undoneDam] = await testDb
        .select()
        .from(dam)
        .where(and(eq(dam.name, 'Imported Tiga Secondary Dam'), isNull(dam.deletedAt)))
        .limit(1);
      expect(undoneDam).toBeUndefined();
    });
  });

  describe('8. Blocker 1 Fix: Import Batch RBDA Scoping & Leak Prevention', () => {
    it('prevents basin officer from RBDA A reading or committing a batch for RBDA B (404) or SLIS farmer batch', async () => {
      // Create a valid file for Chad RBDA
      const chadFileId = await createImportExcel('blis.basin', [
        {
          code: 'CHAD-ISOLATION-1',
          name: 'Chad Isolation Basin',
          rbdaCode: 'CHADRBDA',
          geomWkt: 'MULTIPOLYGON(((12.5 11.5, 12.6 11.5, 12.6 11.6, 12.5 11.6, 12.5 11.5)))',
        },
      ]);

      // 1. Chad officer initiates import for Chad RBDA
      const chadUploadRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${chadOfficerToken}` },
        payload: { fileId: chadFileId, dataset: 'blis.basin', rbdaId: CHAD_RBDA_ID },
      });
      expect(chadUploadRes.statusCode).toBe(201);
      const chadBatch = JSON.parse(chadUploadRes.payload);

      // Chad batch works for Chad officer
      const chadGetRes = await app.inject({
        method: 'GET',
        url: `/imports/${chadBatch.id}`,
        headers: { authorization: `Bearer ${chadOfficerToken}` },
      });
      expect(chadGetRes.statusCode).toBe(200);

      // 2. HJ officer (RBDA A) cannot read Chad batch (RBDA B) -> 404
      const hjReadRes = await app.inject({
        method: 'GET',
        url: `/imports/${chadBatch.id}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(hjReadRes.statusCode).toBe(404);

      // HJ officer cannot preview Chad batch -> 404
      const hjPreviewRes = await app.inject({
        method: 'GET',
        url: `/imports/${chadBatch.id}/preview`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(hjPreviewRes.statusCode).toBe(404);

      // HJ officer cannot commit Chad batch -> 404
      const hjCommitRes = await app.inject({
        method: 'POST',
        url: `/imports/${chadBatch.id}/commit`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(hjCommitRes.statusCode).toBe(404);

      // 3. Create a SLIS farmer batch
      const slisFarmerFileId = await createImportExcel('blis.basin', [
        { code: 'DUMMY', name: 'Dummy' },
      ]);
      const [slisBatchRow] = await testDb
        .insert(importBatch)
        .values({
          dataset: 'slis.farmer',
          fileId: slisFarmerFileId,
          schemeId: crypto.randomUUID(),
          stateId: crypto.randomUUID(),
          createdBy: SYSTEM_USER_ID,
          status: 'uploaded',
        })
        .returning();

      // HJ officer cannot read the SLIS farmer batch -> 404
      const hjSlisReadRes = await app.inject({
        method: 'GET',
        url: `/imports/${slisBatchRow.id}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(hjSlisReadRes.statusCode).toBe(404);
    });
  });

  describe('9. Blocker 2 Fix: PostGIS Geometry Validation and Round-trip', () => {
    it('rejects invalid GeoJSON with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-INVALID-GEOJSON',
          name: 'Invalid GeoJSON Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: 'not-valid-json',
        },
      });
      expect(res.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-INVALID-GEOJSON-2',
          name: 'Invalid Object Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { foo: 'bar' },
        },
      });
      expect(res2.statusCode).toBe(400);
    });

    it('rejects empty geometry with 400', async () => {
      const resPoint = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-EMPTY-GEOM',
          name: 'Empty Geom Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: [] },
        },
      });
      expect(resPoint.statusCode).toBe(400);

      const resPoly = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'BASIN-EMPTY-GEOM',
          name: 'Empty Geom Basin',
          rbdaId: HJ_RBDA_ID,
          geom: { type: 'Polygon', coordinates: [] },
        },
      });
      expect(resPoly.statusCode).toBe(400);
    });

    it('rejects wrong geometry type for column with 400', async () => {
      // Station column is Point: passing Polygon should fail with 400
      const resStation = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-WRONG-TYPE',
          name: 'Wrong Type Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: {
            type: 'Polygon',
            coordinates: [
              [
                [8.5, 11.5],
                [8.6, 11.5],
                [8.6, 11.6],
                [8.5, 11.6],
                [8.5, 11.5],
              ],
            ],
          },
        },
      });
      expect(resStation.statusCode).toBe(400);

      // Basin column is MultiPolygon: passing Point should fail with 400
      const resBasin = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'BASIN-WRONG-TYPE',
          name: 'Wrong Type Basin',
          rbdaId: HJ_RBDA_ID,
          geom: { type: 'Point', coordinates: [8.5, 11.5] },
        },
      });
      expect(resBasin.statusCode).toBe(400);
    });

    it('rejects station outside Nigeria bounding box with 400', async () => {
      // Longitude > 15.0
      const resLonHigh = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-OUTSIDE-LON',
          name: 'Outside Nigeria Lon',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: [50.0, 10.0] },
        },
      });
      expect(resLonHigh.statusCode).toBe(400);

      // Latitude < 4.0
      const resLatLow = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-OUTSIDE-LAT',
          name: 'Outside Nigeria Lat',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: [8.5, 2.0] },
        },
      });
      expect(resLatLow.statusCode).toBe(400);
    });

    it('repairs self-intersecting polygon into valid geometry using ST_MakeValid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/blis/basins',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'BASIN-SELF-INTERSECT',
          name: 'Self Intersecting Basin',
          rbdaId: HJ_RBDA_ID,
          geom: {
            type: 'Polygon',
            coordinates: [
              [
                [8.5, 11.5],
                [8.7, 11.7],
                [8.7, 11.5],
                [8.5, 11.7],
                [8.5, 11.5],
              ],
            ],
          },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.geom).toBeDefined();
      expect(body.geom.type).toBe('MultiPolygon');
    });

    it('round-trip returns the exact same coordinates', async () => {
      const targetCoords = [8.854321, 11.876543];
      const createRes = await app.inject({
        method: 'POST',
        url: '/blis/stations',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          code: 'ST-ROUNDTRIP',
          name: 'Roundtrip Station',
          basinId: createdBasinId,
          stationTypeId: ST_DISCHARGE_ID,
          geom: { type: 'Point', coordinates: targetCoords },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.payload);

      const getRes = await app.inject({
        method: 'GET',
        url: `/blis/stations/${created.id}`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      const retrieved = JSON.parse(getRes.payload);
      expect(retrieved.geom.coordinates).toEqual(targetCoords);
    });
  });
});
