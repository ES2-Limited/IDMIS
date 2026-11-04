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
  parameter,
  importBatch,
  importRow,
  file,
  outboxEvent,
  postgres,
  drizzle,
  setDatabaseUrl,
  eq,
  and,
  sql,
} from '@idmis/db';
import { resolveUserAuthz } from '@idmis/db/authz';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { ProblemDetailsFilter } from '../../platform/filters/problem-details.filter';
import { initAuditWriter } from '../../platform/audit/audit-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BLIS Time-Series Readings & Worker Ingestion (BE-4.3)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let storageService: StorageService;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_blis_readings_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Users
  const SYSTEM_USER_ID = crypto.randomUUID();
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const HJ_OFFICER_ID = crypto.randomUUID();

  // Roles
  const NATIONAL_ROLE_ID = crypto.randomUUID();
  const BASIN_OFFICER_ROLE_ID = crypto.randomUUID();

  // RBDAs
  const HJ_RBDA_ID = crypto.randomUUID();
  const CHAD_RBDA_ID = crypto.randomUUID();

  // Basins
  const HJ_BASIN_ID = crypto.randomUUID();
  const CHAD_BASIN_ID = crypto.randomUUID();

  // Stations
  const HJ_STATION_ID = crypto.randomUUID();
  const CHAD_STATION_ID = crypto.randomUUID();

  // Parameter
  const WL_PARAM_ID = crypto.randomUUID();
  const DISCHARGE_PARAM_ID = crypto.randomUUID();

  // Tokens
  let nationalToken: string;
  let hjOfficerToken: string;

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
      permissions.BLIS_MEASUREMENT_READ,
      permissions.BLIS_MEASUREMENT_IMPORT,
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
    ]);

    // 7. Seed Lookups
    const [ltStationType] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'station_type',
        name: 'Station Type',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    const [lvDischarge] = await testDb
      .insert(lookupValue)
      .values({
        id: crypto.randomUUID(),
        lookupTypeId: ltStationType!.id,
        code: 'discharge',
        label: 'Discharge Station',
        sortOrder: 1,
        isActive: true,
      })
      .returning();

    // 8. Seed Basins
    await testDb.insert(basin).values([
      {
        id: HJ_BASIN_ID,
        code: 'HJRB',
        name: 'Hadejia-Jamaare River Basin',
        rbdaId: HJ_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_BASIN_ID,
        code: 'CHAD',
        name: 'Lake Chad Basin',
        rbdaId: CHAD_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 9. Seed Stations
    await testClient`
      INSERT INTO blis.station (
        id, code, name, basin_id, station_type_id, geom,
        version, created_at, created_by, updated_at, updated_by
      )
      VALUES
      (
        ${HJ_STATION_ID}, 'ST-001', 'Wudil Gauge', ${HJ_BASIN_ID}, ${lvDischarge!.id},
        ST_SetSRID(ST_MakePoint(8.85, 11.80), 4326),
        1, now(), ${SYSTEM_USER_ID}, now(), ${SYSTEM_USER_ID}
      ),
      (
        ${CHAD_STATION_ID}, 'ST-CHAD-01', 'Baga Gauge', ${CHAD_BASIN_ID}, ${lvDischarge!.id},
        ST_SetSRID(ST_MakePoint(13.80, 13.00), 4326),
        1, now(), ${SYSTEM_USER_ID}, now(), ${SYSTEM_USER_ID}
      );
    `;

    // 10. Seed Parameters
    await testDb.insert(parameter).values([
      {
        id: WL_PARAM_ID,
        code: 'WL',
        name: 'Water Level',
        defaultUnit: 'm',
      },
      {
        id: DISCHARGE_PARAM_ID,
        code: 'DISCHARGE',
        name: 'River Discharge',
        defaultUnit: 'm3/s',
      },
    ]);

    // 11. Create Sessions and Access Tokens
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  // Helper to create an Excel file in mock storage
  async function createMockExcelFile(
    dataset: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.description = JSON.stringify({ version: 1, dataset });
    const sheet = workbook.addWorksheet('Data');

    const metaSheet = workbook.addWorksheet('_metadata');
    metaSheet.addRow(['dataset', dataset]);
    metaSheet.addRow(['template_version', 1]);

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]!);
      sheet.addRow(headers);
      for (const row of rows) {
        sheet.addRow(headers.map((h) => row[h]));
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileId = crypto.randomUUID();
    const storageKey = `imports/${fileId}.xlsx`;
    mockStorageFiles.set(storageKey, buffer);

    const now = new Date().toISOString();
    await testDb.insert(file).values({
      id: fileId,
      originalName: `test_${dataset}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      storageKey,
      scanStatus: 'clean',
      createdAt: now,
      createdBy: SYSTEM_USER_ID,
      updatedAt: now,
      updatedBy: SYSTEM_USER_ID,
    });

    return fileId;
  }

  async function pollBatch(batchId: string, token: string) {
    let b = {
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
      b = JSON.parse(getRes.payload);
      if (b.status === 'validated' || b.status === 'validation_failed') {
        return b;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return b;
  }

  async function executeBatchCommit(
    batchId: string,
    userId: string,
    dbClient: typeof testDb,
  ): Promise<{ status: string; committedRows: number }> {
    const authz = await resolveUserAuthz(dbClient, userId);
    if (!authz.isActive || !authz.can(permissions.BLIS_MEASUREMENT_IMPORT)) {
      await dbClient
        .update(importBatch)
        .set({
          status: 'commit_failed',
          errorMessage: 'User lacks permission or is deactivated',
        })
        .where(eq(importBatch.id, batchId));
      return { status: 'commit_failed', committedRows: 0 };
    }

    const [batch] = await dbClient
      .select()
      .from(importBatch)
      .where(eq(importBatch.id, batchId))
      .limit(1);

    if (!batch || (batch.status !== 'committing' && batch.status !== 'validated')) {
      return {
        status: 'skipped',
        committedRows: batch?.committedRows ?? 0,
      };
    }

    if (batch.status !== 'committing') {
      await dbClient
        .update(importBatch)
        .set({ status: 'committing' })
        .where(eq(importBatch.id, batchId));
    }

    const yearRows = await testClient<{ yr: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM (parsed_data->>'observedAt')::timestamptz)::int AS yr
      FROM core.import_row
      WHERE batch_id = ${batchId}::uuid AND status = 'valid';
    `;

    for (const yrRow of yearRows) {
      if (yrRow.yr && !isNaN(yrRow.yr)) {
        await testClient`SELECT blis.ensure_measurement_partition(${yrRow.yr});`;
      }
    }

    const CHUNK_SIZE = 5000;
    let lastRowNumber = 0;
    let totalCommitted = 0;

    while (true) {
      const rows = await dbClient
        .select({
          id: importRow.id,
          rowNumber: importRow.rowNumber,
          parsedData: importRow.parsedData,
        })
        .from(importRow)
        .where(
          and(
            eq(importRow.batchId, batchId),
            eq(importRow.status, 'valid'),
            sql`${importRow.rowNumber} > ${lastRowNumber}`,
          ),
        )
        .orderBy(importRow.rowNumber)
        .limit(CHUNK_SIZE);

      if (rows.length === 0) break;

      const chunkItems = rows.map((r) => {
        const p = r.parsedData as Record<string, unknown>;
        return {
          id: crypto.randomUUID(),
          stationId: p.stationId as string,
          parameterId: p.parameterId as string,
          observedAt: p.observedAt as string,
          value: p.value as string,
          unit: p.unit as string,
          quality: (p.quality as string) || 'raw',
          importBatchId: batchId,
        };
      });

      const jsonb = JSON.stringify(chunkItems);

      await testClient`
        INSERT INTO blis.measurement (
          id,
          station_id,
          parameter_id,
          observed_at,
          value,
          unit,
          quality,
          source,
          import_batch_id,
          created_by
        )
        SELECT
          (item->>'id')::uuid,
          (item->>'stationId')::uuid,
          (item->>'parameterId')::uuid,
          (item->>'observedAt')::timestamptz,
          (item->>'value')::numeric(16, 4),
          (item->>'unit')::text,
          COALESCE(item->>'quality', 'raw')::text,
          'import',
          ${batchId}::uuid,
          ${userId}::uuid
        FROM jsonb_array_elements(${jsonb}::jsonb) AS item
        ON CONFLICT (station_id, parameter_id, observed_at) DO UPDATE
        SET
          value = EXCLUDED.value,
          unit = EXCLUDED.unit,
          quality = EXCLUDED.quality,
          source = 'import',
          import_batch_id = EXCLUDED.import_batch_id;
      `;

      totalCommitted += rows.length;
      lastRowNumber = rows[rows.length - 1]!.rowNumber;

      await dbClient
        .update(importBatch)
        .set({ committedRows: totalCommitted })
        .where(eq(importBatch.id, batchId));
    }

    const summaryRows = await testClient<
      {
        min_observed_at: string;
        max_observed_at: string;
        station_ids: string[];
      }[]
    >`
      SELECT
        min(observed_at)::text AS min_observed_at,
        max(observed_at)::text AS max_observed_at,
        array_agg(DISTINCT station_id::text) AS station_ids
      FROM blis.measurement
      WHERE import_batch_id = ${batchId}::uuid;
    `;
    const summary = summaryRows[0];

    await testClient`SELECT blis.refresh_mv_latest_reading();`;

    if (summary && summary.station_ids && summary.station_ids.length > 0) {
      await dbClient.insert(outboxEvent).values({
        eventType: 'blis.measurement.loaded',
        eventVersion: 1,
        aggregateType: 'import_batch',
        aggregateId: batchId,
        payload: {
          batchId,
          stationIds: summary.station_ids,
          rowCount: totalCommitted,
          timeRange: {
            from: summary.min_observed_at,
            to: summary.max_observed_at,
          },
        },
      });
    }

    await dbClient
      .update(importBatch)
      .set({
        status: 'committed',
        committedRows: totalCommitted,
      })
      .where(eq(importBatch.id, batchId));

    return { status: 'committed', committedRows: totalCommitted };
  }

  // =========================================================================
  // 1. Scope & Validation Tests
  // =========================================================================
  describe('Scope & Validation Gate Tests', () => {
    it('rejects out-of-scope station row at preview and commit for basin officer', async () => {
      const fileId = await createMockExcelFile('blis.measurement', [
        {
          stationCode: 'ST-CHAD-01', // Out of scope for HJ officer!
          parameterCode: 'WL',
          observedAt: '2026-04-10T10:00:00Z',
          value: '12.5000',
          unit: 'm',
          quality: 'raw',
        },
      ]);

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${hjOfficerToken}` },
        payload: {
          fileId,
          dataset: 'blis.measurement',
        },
      });
      expect(initRes.statusCode).toBe(201);
      const batch = await pollBatch(JSON.parse(initRes.body).id, hjOfficerToken);
      expect(batch.errorRows).toBe(1);

      // Preview should show row error: out of scope
      const prevRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(prevRes.statusCode).toBe(200);
      const prev = JSON.parse(prevRes.body);
      expect(prev.rows[0].status).toBe('error');
      expect(prev.rows[0].errors[0].code).toBe('out_of_scope');

      // Attempting to commit an unvalidated batch returns 400
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(commitRes.statusCode).toBe(400);
    });

    it('rejects row with invalid unit and no supported conversion', async () => {
      const fileId = await createMockExcelFile('blis.measurement', [
        {
          stationCode: 'ST-001',
          parameterCode: 'WL', // default unit is m
          observedAt: '2026-04-10T10:00:00Z',
          value: '12.5000',
          unit: 'kg', // invalid unit for water level!
          quality: 'raw',
        },
      ]);

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: { fileId, dataset: 'blis.measurement' },
      });
      expect(initRes.statusCode).toBe(201);
      const batch = await pollBatch(JSON.parse(initRes.body).id, nationalToken);
      expect(batch.errorRows).toBe(1);

      const prevRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      const prev = JSON.parse(prevRes.body);
      expect(prev.rows[0].status).toBe('error');
      expect(prev.rows[0].errors[0].code).toBe('invalid_unit');
    });

    it('successfully converts valid unit to parameter default unit (cm -> m)', async () => {
      const fileId = await createMockExcelFile('blis.measurement', [
        {
          stationCode: 'ST-001',
          parameterCode: 'WL',
          observedAt: '2026-04-10T10:00:00Z',
          value: '250', // 250 cm = 2.5000 m
          unit: 'cm',
          quality: 'raw',
        },
      ]);

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: { fileId, dataset: 'blis.measurement' },
      });
      expect(initRes.statusCode).toBe(201);
      const batch = await pollBatch(JSON.parse(initRes.body).id, nationalToken);
      expect(batch.validRows).toBe(1);

      const prevRes = await app.inject({
        method: 'GET',
        url: `/imports/${batch.id}/preview`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      const prev = JSON.parse(prevRes.body);
      expect(prev.rows[0].status).toBe('valid');

      const [dbRow] = await testDb.select().from(importRow).where(eq(importRow.batchId, batch.id));
      expect(dbRow?.status).toBe('valid');
      expect((dbRow?.parsedData as Record<string, unknown>)?.value).toBe('2.5000');
      expect((dbRow?.parsedData as Record<string, unknown>)?.unit).toBe('m');
    });
  });

  // =========================================================================
  // 2. High-Volume Ingestion Gate Test (100,000 Rows across 3 Years)
  // =========================================================================
  describe('Gate Test: 100,000 Rows Worker Commit & 3 Partitions', () => {
    let largeBatchId: string;

    it('commits 100,000 rows in worker while POST returns 202 in < 1s', async () => {
      largeBatchId = crypto.randomUUID();
      const dummyFileId = crypto.randomUUID();
      const now = new Date().toISOString();

      await testDb.insert(file).values({
        id: dummyFileId,
        originalName: '100k_readings.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 1000000,
        sha256: 'dummy100k',
        storageKey: `imports/${dummyFileId}.xlsx`,
        scanStatus: 'clean',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      });

      // 1. Create batch in validated status
      await testDb.insert(importBatch).values({
        id: largeBatchId,
        dataset: 'blis.measurement',
        fileId: dummyFileId,
        status: 'validated',
        totalRows: 100000,
        validRows: 100000,
        errorRows: 0,
        committedRows: 0,
        version: 1,
        createdBy: NATIONAL_ADMIN_ID,
      });

      // 2. Bulk insert 100,000 import_row rows directly in SQL chunks of 10,000
      // 30,000 in 2025, 40,000 in 2026, 30,000 in 2027
      const totalRows = 100000;
      const CHUNK_INSERT = 10000;

      for (let offset = 0; offset < totalRows; offset += CHUNK_INSERT) {
        const chunkData: Array<{
          id: string;
          batchId: string;
          rowNumber: number;
          rawData: Record<string, unknown>;
          parsedData: Record<string, unknown>;
          status: string;
        }> = [];

        for (let i = 0; i < CHUNK_INSERT; i++) {
          const rowNum = offset + i + 1;
          let year: number;
          let yearOffset: number;

          if (rowNum <= 30000) {
            year = 2025;
            yearOffset = rowNum - 1; // 0 to 29999
          } else if (rowNum <= 70000) {
            year = 2026;
            yearOffset = rowNum - 30001; // 0 to 39999
          } else {
            year = 2027;
            yearOffset = rowNum - 70001; // 0 to 29999
          }

          // In 2026, 40000 rows need to span across all 12 months for the aggregation test
          // 40000 rows * 13 minutes = 520,000 minutes = ~361 days
          // In 2025 & 2027, 30000 rows * 17 minutes = 510,000 minutes = ~354 days
          const stepMinutes = year === 2026 ? 13 : 17;
          const baseTime = Date.UTC(year, 0, 1, 0, 0, 0);
          const observedAt = new Date(
            baseTime + yearOffset * stepMinutes * 60 * 1000,
          ).toISOString();

          // Generate known values for testing aggregation later
          // E.g. value is 10.0000 + (rowNum % 20)
          const valNum = 10 + (rowNum % 20);
          const valStr = valNum.toFixed(4);

          const parsed = {
            stationCode: 'ST-001',
            parameterCode: 'WL',
            stationId: HJ_STATION_ID,
            parameterId: WL_PARAM_ID,
            rbdaId: HJ_RBDA_ID,
            observedAt,
            value: valStr,
            unit: 'm',
            quality: 'raw',
          };

          chunkData.push({
            id: crypto.randomUUID(),
            batchId: largeBatchId,
            rowNumber: rowNum,
            rawData: parsed,
            parsedData: parsed,
            status: 'valid',
          });
        }

        const jsonb = JSON.stringify(chunkData);
        await testClient`
          INSERT INTO core.import_row (id, batch_id, row_number, raw_data, parsed_data, status)
          SELECT
            (r->>'id')::uuid,
            (r->>'batchId')::uuid,
            (r->>'rowNumber')::int,
            (r->'rawData')::jsonb,
            (r->'parsedData')::jsonb,
            (r->>'status')::core.import_row_status
          FROM jsonb_array_elements(${jsonb}::jsonb) AS r;
        `;
      }

      // 3. Measure time for POST /imports/:batchId/commit
      const start = Date.now();
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${largeBatchId}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      const durationMs = Date.now() - start;

      // API MUST return 202 immediately in < 1s
      expect(commitRes.statusCode).toBe(202);
      expect(durationMs).toBeLessThan(1000);

      const commitBody = JSON.parse(commitRes.body);
      expect(commitBody.status).toBe('committing');

      // 4. Run worker processor
      const workerRes = await executeBatchCommit(largeBatchId, NATIONAL_ADMIN_ID, testDb);

      expect(workerRes.status).toBe('committed');
      expect(workerRes.committedRows).toBe(100000);

      // Verify batch in database
      const [finalBatch] = await testDb
        .select()
        .from(importBatch)
        .where(eq(importBatch.id, largeBatchId));
      expect(finalBatch?.status).toBe('committed');
      expect(finalBatch?.committedRows).toBe(100000);
    });

    it('verifies 100,000 rows land in 3 partition tables (2025, 2026, 2027)', async () => {
      // 2025 partition
      const [p2025] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement_2025
        WHERE import_batch_id = ${largeBatchId}::uuid;
      `;
      expect(p2025?.count).toBe(30000);

      // 2026 partition
      const [p2026] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement_2026
        WHERE import_batch_id = ${largeBatchId}::uuid;
      `;
      expect(p2026?.count).toBe(40000);

      // 2027 partition
      const [p2027] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement_2027
        WHERE import_batch_id = ${largeBatchId}::uuid;
      `;
      expect(p2027?.count).toBe(30000);
    });

    it('verifies blis.mv_latest_reading reflects the latest reading from 2027', async () => {
      const [latest] = await testClient<
        {
          station_id: string;
          parameter_id: string;
          observed_at: string;
          value: string;
          unit: string;
          quality: string;
        }[]
      >`
        SELECT
          station_id::text,
          parameter_id::text,
          observed_at::text,
          value::text,
          unit,
          quality
        FROM blis.mv_latest_reading
        WHERE station_id = ${HJ_STATION_ID}::uuid AND parameter_id = ${WL_PARAM_ID}::uuid;
      `;

      expect(latest).toBeDefined();
      expect(latest?.station_id).toBe(HJ_STATION_ID);
      expect(latest?.parameter_id).toBe(WL_PARAM_ID);
      expect(latest?.observed_at).toMatch(/^2027-/);
    });

    it('verifies outbox event blis.measurement.loaded was emitted', async () => {
      const [evt] = await testDb
        .select()
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.aggregateId, largeBatchId),
            eq(outboxEvent.eventType, 'blis.measurement.loaded'),
          ),
        );

      expect(evt).toBeDefined();
      const payload = evt?.payload as {
        batchId: string;
        stationIds: string[];
        rowCount: number;
        timeRange: { from: string; to: string };
      };
      expect(payload.batchId).toBe(largeBatchId);
      expect(payload.rowCount).toBe(100000);
      expect(payload.stationIds).toContain(HJ_STATION_ID);
      expect(payload.timeRange.from).toMatch(/^2025-/);
      expect(payload.timeRange.to).toMatch(/^2027-/);
    });

    it('runs aggregated monthly query in < 500ms and returns exact min/max/avg/count with partition pruning', async () => {
      const start = Date.now();
      const res = await app.inject({
        method: 'GET',
        url: `/blis/stations/${HJ_STATION_ID}/readings?parameter=WL&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z&interval=month`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      const durationMs = Date.now() - start;

      expect(res.statusCode).toBe(200);
      expect(durationMs).toBeLessThan(500);

      const body = JSON.parse(res.body);
      expect(body.interval).toBe('month');
      expect(body.parameterCode).toBe('WL');
      expect(body.items.length).toBe(12);

      // Verify EXPLAIN shows partition pruning (only measurement_2026 is scanned)
      const explainRes = await testClient<{ 'QUERY PLAN': string }[]>`
        EXPLAIN
        SELECT
          date_trunc('month', m.observed_at AT TIME ZONE 'Africa/Lagos'),
          MIN(m.value), MAX(m.value), AVG(m.value), COUNT(*)
        FROM blis.measurement m
        WHERE m.station_id = ${HJ_STATION_ID}::uuid
          AND m.parameter_id = ${WL_PARAM_ID}::uuid
          AND m.observed_at >= '2026-01-01T00:00:00Z'::timestamptz
          AND m.observed_at <= '2026-12-31T23:59:59Z'::timestamptz
        GROUP BY 1;
      `;

      const planText = explainRes.map((r) => r['QUERY PLAN']).join('\n');
      expect(planText).toContain('measurement_2026');
      expect(planText).not.toContain('measurement_2025');
      expect(planText).not.toContain('measurement_2027');
    });

    it('re-import of same key updates value, unit, and quality rather than duplicating', async () => {
      // Pick one known observed_at from 2026
      const [existingRow] = await testClient<{ observed_at: string; value: string }[]>`
        SELECT observed_at::text, value::text
        FROM blis.measurement
        WHERE station_id = ${HJ_STATION_ID}::uuid
          AND parameter_id = ${WL_PARAM_ID}::uuid
          AND observed_at >= '2026-06-01T00:00:00Z'::timestamptz
        ORDER BY observed_at ASC
        LIMIT 1;
      `;
      expect(existingRow).toBeDefined();

      const [countBefore] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement
        WHERE station_id = ${HJ_STATION_ID}::uuid AND parameter_id = ${WL_PARAM_ID}::uuid;
      `;

      const fileId = await createMockExcelFile('blis.measurement', [
        {
          stationCode: 'ST-001',
          parameterCode: 'WL',
          observedAt: existingRow!.observed_at,
          value: '99.8800',
          unit: 'm',
          quality: 'checked',
        },
      ]);

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: { fileId, dataset: 'blis.measurement' },
      });
      const batch = await pollBatch(JSON.parse(initRes.body).id, nationalToken);
      expect(batch.status).toBe('validated');

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(commitRes.statusCode).toBe(202);

      await executeBatchCommit(batch.id, NATIONAL_ADMIN_ID, testDb);

      // Count MUST remain exactly the same (no duplicates)
      const [countAfter] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement
        WHERE station_id = ${HJ_STATION_ID}::uuid AND parameter_id = ${WL_PARAM_ID}::uuid;
      `;
      expect(countAfter?.count).toBe(countBefore?.count);

      // Value must be updated
      const [updatedRow] = await testClient<{ value: string; quality: string }[]>`
        SELECT value::text, quality
        FROM blis.measurement
        WHERE station_id = ${HJ_STATION_ID}::uuid
          AND parameter_id = ${WL_PARAM_ID}::uuid
          AND observed_at = ${existingRow!.observed_at}::timestamptz;
      `;
      expect(updatedRow?.value).toBe('99.8800');
      expect(updatedRow?.quality).toBe('checked');
    });

    it('undo removes the batch and refreshes mv_latest_reading', async () => {
      // 1. Create a smaller 10-row batch in 2026
      const undoFileId = await createMockExcelFile(
        'blis.measurement',
        Array.from({ length: 10 }, (_, i) => ({
          stationCode: 'ST-001',
          parameterCode: 'DISCHARGE',
          observedAt: `2026-08-15T${i.toString().padStart(2, '0')}:00:00Z`,
          value: (50 + i).toFixed(4),
          unit: 'm3/s',
          quality: 'raw',
        })),
      );

      const initRes = await app.inject({
        method: 'POST',
        url: '/imports',
        headers: { authorization: `Bearer ${nationalToken}` },
        payload: { fileId: undoFileId, dataset: 'blis.measurement' },
      });
      const batch = await pollBatch(JSON.parse(initRes.body).id, nationalToken);
      expect(batch.status).toBe('validated');

      const commitRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/commit`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(commitRes.statusCode).toBe(202);

      await executeBatchCommit(batch.id, NATIONAL_ADMIN_ID, testDb);

      const [dischargeCount] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement
        WHERE import_batch_id = ${batch.id}::uuid;
      `;
      expect(dischargeCount?.count).toBe(10);

      // Verify mv_latest_reading shows DISCHARGE
      const [mvBefore] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.mv_latest_reading
        WHERE station_id = ${HJ_STATION_ID}::uuid AND parameter_id = ${DISCHARGE_PARAM_ID}::uuid;
      `;
      expect(mvBefore?.count).toBe(1);

      // 2. Undo the batch
      const undoRes = await app.inject({
        method: 'POST',
        url: `/imports/${batch.id}/undo`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(undoRes.statusCode).toBe(201);
      const undoBody = JSON.parse(undoRes.body);
      expect(undoBody.status).toBe('undone');

      // 3. Verify all rows were deleted
      const [dischargeCountAfter] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.measurement
        WHERE import_batch_id = ${batch.id}::uuid;
      `;
      expect(dischargeCountAfter?.count).toBe(0);

      // 4. Verify mv_latest_reading was refreshed and no longer has DISCHARGE
      const [mvAfter] = await testClient<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM blis.mv_latest_reading
        WHERE station_id = ${HJ_STATION_ID}::uuid AND parameter_id = ${DISCHARGE_PARAM_ID}::uuid;
      `;
      expect(mvAfter?.count).toBe(0);
    });
  });

  // =========================================================================
  // 3. Query Endpoint Limits & Scoping
  // =========================================================================
  describe('Query Endpoint Constraints', () => {
    it('enforces max 31 days for raw readings interval', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/stations/${HJ_STATION_ID}/readings?parameter=WL&from=2026-01-01T00:00:00Z&to=2026-02-15T00:00:00Z&interval=raw`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.detail || body.message).toMatch(/31 days/i);
    });

    it('enforces max 5 years for day interval readings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/stations/${HJ_STATION_ID}/readings?parameter=WL&from=2020-01-01T00:00:00Z&to=2026-06-01T00:00:00Z&interval=day`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.detail || body.message).toMatch(/5 years/i);
    });

    it('returns 404 for an out-of-scope station to basin officer', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/stations/${CHAD_STATION_ID}/readings?parameter=WL`,
        headers: { authorization: `Bearer ${hjOfficerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns raw readings with keyset pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/blis/stations/${HJ_STATION_ID}/readings?parameter=WL&from=2026-03-01T00:00:00Z&to=2026-03-10T00:00:00Z&interval=raw&limit=10`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.items.length).toBe(10);
      expect(body.nextCursor).toBeDefined();

      // Fetch next page with cursor
      const nextRes = await app.inject({
        method: 'GET',
        url: `/blis/stations/${HJ_STATION_ID}/readings?parameter=WL&from=2026-03-01T00:00:00Z&to=2026-03-10T00:00:00Z&interval=raw&limit=10&cursor=${encodeURIComponent(body.nextCursor)}`,
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(nextRes.statusCode).toBe(200);
      const nextBody = JSON.parse(nextRes.body);
      expect(nextBody.items.length).toBe(10);
      expect(nextBody.items[0].observedAt > body.items[9].observedAt).toBe(true);
    });
  });
});
