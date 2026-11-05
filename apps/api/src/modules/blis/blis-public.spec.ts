import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { permissions } from '@idmis/contracts';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  session,
  organisation,
  organisationState,
  state,
  device,
  lookupType,
  lookupValue,
  basin,
  dam,
  damSafetyInspection,
  station,
  parameter,
  measurement,
  streamFlowReading,
  postgres,
  drizzle,
  setDatabaseUrl,
  migrate,
  sql,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { ProblemDetailsFilter } from '../../platform/filters/problem-details.filter';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import type { TransactionClient } from '../../platform/database/transaction.helper';
import { BlisPublicService } from './public';
import { StreamFlowImportHandler } from '../slis/imports/stream-flow.handler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('BLIS Public Services & SLIS Stream-Flow Boundary Enforcement (BE-4.6)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let blisPublicService: BlisPublicService;
  let streamFlowImportHandler: StreamFlowImportHandler;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: ReturnType<typeof drizzle>;

  const TEST_DB_NAME = `idmis_test_blis_public_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = (
    process.env.DATABASE_URL || 'postgresql://idmis:idmis@127.0.0.1:5432/idmis'
  ).replace('localhost', '127.0.0.1');
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Test IDs
  const SYSTEM_USER_ID = crypto.randomUUID();
  const KANO_OFFICER_ID = crypto.randomUUID();
  const SCHEME_ROLE_ID = crypto.randomUUID();

  const KANO_STATE_ID = crypto.randomUUID();
  const KANO_SCHEME_ID = crypto.randomUUID();
  const TEST_DEVICE_ID = crypto.randomUUID();

  const TEST_RBDA_ID = crypto.randomUUID();
  const TEST_BASIN_ID = crypto.randomUUID();
  const ACTIVE_STATION_ID = crypto.randomUUID();
  const INACTIVE_STATION_ID = crypto.randomUUID();
  const UNKNOWN_STATION_ID = crypto.randomUUID();
  const TEST_DAM_ID = crypto.randomUUID();
  const TEST_INSPECTION_ID = crypto.randomUUID();
  const TEST_PARAM_ID = crypto.randomUUID();

  let kanoOfficerToken: string;

  beforeAll(async () => {
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient);
    setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;

    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    const adapter = new FastifyAdapter();
    try {
      app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
      app.useGlobalFilters(new ProblemDetailsFilter());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    } catch (err) {
      console.error('NEST_INIT_FAILED:', err);
      throw err;
    }

    tokenService = app.get(TokenService);
    blisPublicService = app.get(BlisPublicService);
    streamFlowImportHandler = app.get(StreamFlowImportHandler);

    // 1. Seed Core Entities
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System Automation',
        passwordHash: 'dummy',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano.officer@example.com',
        fullName: 'Kano Officer',
        passwordHash: 'dummy',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(state).values({
      id: KANO_STATE_ID,
      code: 'KAN',
      name: 'Kano',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

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
        id: TEST_RBDA_ID,
        type: 'rbda',
        code: 'HJRBDA',
        name: 'Hadejia-Jamaare RBDA',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values({
      organisationId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
    });

    await testDb.insert(role).values({
      id: SCHEME_ROLE_ID,
      key: 'scheme_operator',
      name: 'Scheme Operator',
      description: 'Manages stream flow readings and sync',
      isSystem: true,
    });

    await testDb.insert(rolePermission).values([
      { roleId: SCHEME_ROLE_ID, permission: permissions.SLIS_STREAM_FLOW_RECORD },
      { roleId: SCHEME_ROLE_ID, permission: permissions.SLIS_SYNC_PUSH },
      { roleId: SCHEME_ROLE_ID, permission: permissions.CORE_IMPORT_RUN },
      { roleId: SCHEME_ROLE_ID, permission: permissions.SLIS_IMPORT_RUN },
    ]);

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      roleId: SCHEME_ROLE_ID,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: KANO_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const sid = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sid,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: 'hash',
      userAgent: 'test-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    kanoOfficerToken = (await tokenService.createAccessToken(KANO_OFFICER_ID, sid)).accessToken;

    await testDb.insert(device).values({
      id: TEST_DEVICE_ID,
      installationId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      platform: 'android',
      registeredAt: new Date().toISOString(),
    });

    // 2. Seed BLIS Entities
    const stationLookupTypeId = crypto.randomUUID();
    await testDb.insert(lookupType).values({
      id: stationLookupTypeId,
      key: 'station_type',
      name: 'Station Type',
      module: 'blis',
    });

    const stationTypeId = crypto.randomUUID();
    await testDb.insert(lookupValue).values({
      id: stationTypeId,
      lookupTypeId: stationLookupTypeId,
      code: 'hydrological',
      label: 'Hydrological Station',
    });

    await testDb.insert(basin).values({
      id: TEST_BASIN_ID,
      code: 'CHAD-B',
      name: 'Lake Chad Basin',
      rbdaId: TEST_RBDA_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Active Station
    await testDb.insert(station).values({
      id: ACTIVE_STATION_ID,
      code: 'ST-ACT-001',
      name: 'Active Kano Gauge',
      basinId: TEST_BASIN_ID,
      stationTypeId,
      river: 'Kano River',
      geom: sql`ST_SetSRID(ST_MakePoint(8.5, 12.0), 4326)`,
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Inactive Station
    await testDb.insert(station).values({
      id: INACTIVE_STATION_ID,
      code: 'ST-INA-002',
      name: 'Decommissioned Kano Gauge',
      basinId: TEST_BASIN_ID,
      stationTypeId,
      river: 'Kano River',
      geom: sql`ST_SetSRID(ST_MakePoint(8.55, 12.05), 4326)`,
      isActive: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Dam
    await testDb.insert(dam).values({
      id: TEST_DAM_ID,
      code: 'DAM-TIGA',
      name: 'Tiga Dam',
      basinId: TEST_BASIN_ID,
      geom: sql`ST_SetSRID(ST_MakePoint(8.6, 11.5), 4326)`,
      crestLengthM: '7000.00',
      heightM: '48.00',
      spillwayCapacityM3s: '3000.00',
      reservoirCapacityMcm: '1900.00',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Parameter
    await testDb.insert(parameter).values({
      id: TEST_PARAM_ID,
      code: 'WL',
      name: 'Water Level',
      defaultUnit: 'm3/s',
    });

    // Measurement & Refresh mv_latest_reading
    await testDb.insert(measurement).values({
      id: crypto.randomUUID(),
      stationId: ACTIVE_STATION_ID,
      parameterId: TEST_PARAM_ID,
      observedAt: '2026-03-15T08:00:00.000Z',
      value: '45.5000',
      unit: 'm3/s',
      quality: 'good',
      source: 'manual',
      createdBy: SYSTEM_USER_ID,
    });
    await testClient`SELECT blis.refresh_mv_latest_reading();`;

    // Dam Safety Inspection & Refresh mv_dam_status
    await testDb.insert(damSafetyInspection).values({
      id: TEST_INSPECTION_ID,
      damId: TEST_DAM_ID,
      inspectedOn: '2026-03-01',
      meetsStandard: true,
      hazardClassId: null,
      nextDueOn: '2027-03-01',
      status: 'approved',
      approvedAt: '2026-03-02T10:00:00.000Z',
      approvedBy: SYSTEM_USER_ID,
      submittedAt: '2026-03-01T12:00:00.000Z',
      submittedBy: SYSTEM_USER_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    await testClient`SELECT blis.refresh_mv_dam_status();`;
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

  // --------------------------------------------------------------------------
  // PART 1: BLIS PUBLIC SERVICE CONTRACTS
  // --------------------------------------------------------------------------
  describe('Part 1: BlisPublicService Methods', () => {
    it('lookupStation returns active station details with GeoJSON location', async () => {
      const stationLookup = await blisPublicService.lookupStation(ACTIVE_STATION_ID);
      expect(stationLookup).not.toBeNull();
      expect(stationLookup?.id).toBe(ACTIVE_STATION_ID);
      expect(stationLookup?.code).toBe('ST-ACT-001');
      expect(stationLookup?.isActive).toBe(true);
      expect(stationLookup?.river).toBe('Kano River');
      expect(stationLookup?.location).toBeDefined();
    });

    it('lookupStation returns null for unknown station id', async () => {
      const res = await blisPublicService.lookupStation(UNKNOWN_STATION_ID);
      expect(res).toBeNull();
    });

    it('validateStation returns valid=true for active station', async () => {
      const res = await blisPublicService.validateStation(ACTIVE_STATION_ID);
      expect(res.valid).toBe(true);
      expect(res.station?.id).toBe(ACTIVE_STATION_ID);
    });

    it('validateStation returns valid=false and reason="inactive" for inactive station', async () => {
      const res = await blisPublicService.validateStation(INACTIVE_STATION_ID);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('inactive');
      expect(res.station?.id).toBe(INACTIVE_STATION_ID);
    });

    it('validateStation returns valid=false and reason="not_found" for unknown station', async () => {
      const res = await blisPublicService.validateStation(UNKNOWN_STATION_ID);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('not_found');
    });

    it('getLatestReadings queries blis.mv_latest_reading for station', async () => {
      const readings = await blisPublicService.getLatestReadings(ACTIVE_STATION_ID);
      expect(readings.length).toBe(1);
      expect(readings[0]?.stationId).toBe(ACTIVE_STATION_ID);
      expect(readings[0]?.value).toBe('45.5000');
      expect(readings[0]?.unit).toBe('m3/s');
      expect(readings[0]?.quality).toBe('good');
    });

    it('getDamSafetyStatus queries blis.mv_dam_status for dam', async () => {
      const status = await blisPublicService.getDamSafetyStatus(TEST_DAM_ID);
      expect(status).not.toBeNull();
      expect(status?.damId).toBe(TEST_DAM_ID);
      expect(status?.meetsStandard).toBe(true);
      expect(status?.hazardClass).toBe('High');
      expect(status?.isOverdue).toBe(false);
    });

    it('getBasinSummary returns basin metadata and asset counts', async () => {
      const summary = await blisPublicService.getBasinSummary(TEST_BASIN_ID);
      expect(summary).not.toBeNull();
      expect(summary?.code).toBe('CHAD-B');
      expect(summary?.stationCount).toBe(2); // 1 active, 1 inactive
      expect(summary?.damCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // PART 2: SLIS STREAM-FLOW READING VALIDATION (3 PATHS)
  // --------------------------------------------------------------------------
  describe('Part 2: SLIS Stream-Flow Reading Validation Across All Three Paths', () => {
    let createdReadingId: string;

    // --- Path 1: API (create & update) ---
    describe('Path 1: API (create & update)', () => {
      it('rejects POST with unknown station id with HTTP 400', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/slis/stream-flows',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            schemeId: KANO_SCHEME_ID,
            stationId: UNKNOWN_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '22.5000',
            unit: 'm3/s',
          },
        });

        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.message || body.detail).toContain('does not exist');
      });

      it('rejects POST with inactive station id with HTTP 400', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/slis/stream-flows',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            schemeId: KANO_SCHEME_ID,
            stationId: INACTIVE_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '22.5000',
            unit: 'm3/s',
          },
        });

        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.message || body.detail).toContain('is inactive');
      });

      it('accepts POST with valid active station id with HTTP 201', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/slis/stream-flows',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            schemeId: KANO_SCHEME_ID,
            stationId: ACTIVE_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '22.5000',
            unit: 'm3/s',
          },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.id).toBeDefined();
        expect(body.stationId).toBe(ACTIVE_STATION_ID);
        expect(body.value).toBe('22.5000');
        createdReadingId = body.id;
      });

      it('rejects PATCH with unknown station id with HTTP 400', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: `/slis/stream-flows/${createdReadingId}`,
          headers: {
            authorization: `Bearer ${kanoOfficerToken}`,
            'if-match': '"1"',
          },
          payload: {
            stationId: UNKNOWN_STATION_ID,
          },
        });

        expect(res.statusCode).toBe(400);
      });

      it('rejects PATCH with inactive station id with HTTP 400', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: `/slis/stream-flows/${createdReadingId}`,
          headers: {
            authorization: `Bearer ${kanoOfficerToken}`,
            'if-match': '"1"',
          },
          payload: {
            stationId: INACTIVE_STATION_ID,
          },
        });

        expect(res.statusCode).toBe(400);
      });

      it('accepts PATCH with valid station id with HTTP 200', async () => {
        const res = await app.inject({
          method: 'PATCH',
          url: `/slis/stream-flows/${createdReadingId}`,
          headers: {
            authorization: `Bearer ${kanoOfficerToken}`,
            'if-match': '"1"',
          },
          payload: {
            value: '25.7500',
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.value).toBe('25.7500');
        expect(body.version).toBe(2);
      });
    });

    // --- Path 2: Sync Push ---
    describe('Path 2: Sync Push', () => {
      it('rejects sync push operation with unknown station id with outcome: rejected (status 400)', async () => {
        const opId = crypto.randomUUID();
        const res = await app.inject({
          method: 'POST',
          url: '/slis/sync/push',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            deviceId: TEST_DEVICE_ID,
            ops: [
              {
                opId,
                entity: 'stream_flow_reading',
                action: 'create',
                recordId: crypto.randomUUID(),
                baseVersion: 1,
                data: {
                  schemeId: KANO_SCHEME_ID,
                  stationId: UNKNOWN_STATION_ID,
                  readAt: '2026-03-15T09:00:00.000Z',
                  value: '18.2500',
                  unit: 'm3/s',
                },
              },
            ],
          },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.results[0]?.outcome).toBe('rejected');
        expect(body.results[0]?.errors?.[0]?.status).toBe(400);
        expect(body.results[0]?.errors?.[0]?.detail).toContain('does not exist');
      });

      it('rejects sync push operation with inactive station id with outcome: rejected (status 400)', async () => {
        const opId = crypto.randomUUID();
        const res = await app.inject({
          method: 'POST',
          url: '/slis/sync/push',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            deviceId: TEST_DEVICE_ID,
            ops: [
              {
                opId,
                entity: 'stream_flow_reading',
                action: 'create',
                recordId: crypto.randomUUID(),
                baseVersion: 1,
                data: {
                  schemeId: KANO_SCHEME_ID,
                  stationId: INACTIVE_STATION_ID,
                  readAt: '2026-03-15T09:00:00.000Z',
                  value: '18.2500',
                  unit: 'm3/s',
                },
              },
            ],
          },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.results[0]?.outcome).toBe('rejected');
        expect(body.results[0]?.errors?.[0]?.status).toBe(400);
        expect(body.results[0]?.errors?.[0]?.detail).toContain('is inactive');
      });

      it('applies sync push operation with valid station id with outcome: applied', async () => {
        const opId = crypto.randomUUID();
        const recordId = crypto.randomUUID();
        const res = await app.inject({
          method: 'POST',
          url: '/slis/sync/push',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            deviceId: TEST_DEVICE_ID,
            ops: [
              {
                opId,
                entity: 'stream_flow_reading',
                action: 'create',
                recordId,
                baseVersion: 1,
                data: {
                  schemeId: KANO_SCHEME_ID,
                  stationId: ACTIVE_STATION_ID,
                  readAt: '2026-03-15T09:00:00.000Z',
                  value: '18.2500',
                  unit: 'm3/s',
                },
              },
            ],
          },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.results[0]?.outcome).toBe('applied');

        // Verify row exists in DB
        const [saved] = await testDb
          .select()
          .from(streamFlowReading)
          .where(sql`${streamFlowReading.id} = ${recordId}`);
        expect(saved).toBeDefined();
        expect(saved?.stationId).toBe(ACTIVE_STATION_ID);
      });
    });

    // --- Path 3: Import ---
    describe('Path 3: Import Row Validation', () => {
      const scope = {
        isNational: false,
        stateIds: [KANO_STATE_ID],
        rbdaIds: [],
        schemeIds: [KANO_SCHEME_ID],
        sectorIds: [],
      };

      it('rejects import row with unknown station id with error code STATION_NOT_FOUND', async () => {
        const row = {
          rowNumber: 1,
          rawData: {},
          parsedData: {
            schemeId: KANO_SCHEME_ID,
            stationId: UNKNOWN_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '30.0000',
            unit: 'm3/s',
          },
        };

        const errors = await streamFlowImportHandler.validateRow(
          row,
          scope,
          testDb as unknown as TransactionClient,
        );
        expect(errors.length).toBeGreaterThan(0);
        const stationError = errors.find((e) => e.column === 'stationId');
        expect(stationError).toBeDefined();
        expect(stationError?.code).toBe('STATION_NOT_FOUND');
      });

      it('rejects import row with inactive station id with error code STATION_INACTIVE', async () => {
        const row = {
          rowNumber: 2,
          rawData: {},
          parsedData: {
            schemeId: KANO_SCHEME_ID,
            stationId: INACTIVE_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '30.0000',
            unit: 'm3/s',
          },
        };

        const errors = await streamFlowImportHandler.validateRow(
          row,
          scope,
          testDb as unknown as TransactionClient,
        );
        expect(errors.length).toBeGreaterThan(0);
        const stationError = errors.find((e) => e.column === 'stationId');
        expect(stationError).toBeDefined();
        expect(stationError?.code).toBe('STATION_INACTIVE');
      });

      it('accepts import row with valid active station id with 0 errors', async () => {
        const row = {
          rowNumber: 3,
          rawData: {},
          parsedData: {
            schemeId: KANO_SCHEME_ID,
            stationId: ACTIVE_STATION_ID,
            readAt: '2026-03-15T08:00:00.000Z',
            value: '30.0000',
            unit: 'm3/s',
          },
        };

        const errors = await streamFlowImportHandler.validateRow(
          row,
          scope,
          testDb as unknown as TransactionClient,
        );
        expect(errors.length).toBe(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // PART 3: ARCHITECTURAL BOUNDARY ENFORCEMENT
  // --------------------------------------------------------------------------
  describe('Part 3: Module Boundary Rule Holds', () => {
    it('ESLint boundary rule flags forbidden direct imports across modules', async () => {
      const rootDir = path.resolve(__dirname, '../../../../..');
      const eslint = new ESLint({
        cwd: rootDir,
        overrideConfigFile: path.resolve(rootDir, 'packages/config/eslint.config.mjs'),
      });

      // 1. Direct import from internal BLIS path fails boundary rule
      const invalidCode = `
        import { StationRepository } from '../blis/repositories/station.repository';
        console.log(StationRepository);
      `;
      const invalidResults = await eslint.lintText(invalidCode, {
        filePath: path.resolve(rootDir, 'apps/api/src/modules/slis/dummy.ts'),
      });

      expect(invalidResults.length).toBeGreaterThan(0);
      const boundaryError = invalidResults[0]!.messages.find(
        (m) => m.ruleId === 'boundaries/entry-point',
      );
      expect(boundaryError).toBeDefined();

      // 2. Import through blis/public succeeds with 0 boundary errors
      const validCode = `
        import { BlisPublicService } from '../blis/public';
        console.log(BlisPublicService);
      `;
      const validResults = await eslint.lintText(validCode, {
        filePath: path.resolve(rootDir, 'apps/api/src/modules/slis/dummy.ts'),
      });

      const validBoundaryErrors = validResults[0]!.messages.filter(
        (m) => m.ruleId === 'boundaries/entry-point',
      );
      expect(validBoundaryErrors).toHaveLength(0);
    });

    it('No files in slis or me import BLIS internal tables or repositories directly', () => {
      const rootDir = path.resolve(__dirname, '../../../../..');
      const slisDir = path.resolve(rootDir, 'apps/api/src/modules/slis');
      const meDir = path.resolve(rootDir, 'apps/api/src/modules/me');

      const forbiddenDbTables = [
        'basin',
        'station',
        'parameter',
        'measurement',
        'reservoir',
        'dam',
        'damSafetyInspection',
        'mvDamStatus',
        'mvLatestReading',
      ];

      function checkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (
            entry.isFile() &&
            entry.name.endsWith('.ts') &&
            !entry.name.includes('.spec.') &&
            !entry.name.includes('.test.')
          ) {
            const content = fs.readFileSync(fullPath, 'utf8');

            // 1. Check for cross-module import from blis outside public
            const crossModuleImportMatch = content.match(
              /from\s+['"][^'"]*\/modules\/blis\/(?!public)[^'"]*['"]/,
            );
            expect(crossModuleImportMatch).toBeNull();

            // 2. Check for direct @idmis/db BLIS table imports
            const dbImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]@idmis\/db['"]/);
            if (dbImportMatch && dbImportMatch[1]) {
              const importedSymbols = dbImportMatch[1].split(',').map((s) => s.trim());
              for (const sym of importedSymbols) {
                expect(forbiddenDbTables).not.toContain(sym);
              }
            }
          }
        }
      }

      checkDir(slisDir);
      checkDir(meDir);
    });
  });
});
