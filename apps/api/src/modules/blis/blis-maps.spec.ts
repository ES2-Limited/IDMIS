import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
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
  dam,
  station,
  parameter,
  plot,
  importBatch,
  importRow,
  file,
  mapLayer,
  mapFeature,
  postgres,
  db,
  setDatabaseUrl,
  eq,
  sql,
} from '@idmis/db';
import { AppModule } from '../../app.module';
import { TokenService } from '../auth/token.service';
import { ProblemDetailsFilter } from '../../platform/filters/problem-details.filter';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { BlisComputeQueryService } from './services/blis-compute-query.service';
import { DamInspectionRepository } from './repositories/dam-inspection.repository';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSimpleZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compData = zlib.deflateRawSync(entry.content);

    const lh = Buffer.alloc(30 + nameBuf.length + compData.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(0, 14);
    lh.writeUInt32LE(compData.length, 18);
    lh.writeUInt32LE(entry.content.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);
    compData.copy(lh, 30 + nameBuf.length);
    localHeaders.push(lh);

    const cdh = Buffer.alloc(46 + nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16);
    cdh.writeUInt32LE(compData.length, 20);
    cdh.writeUInt32LE(entry.content.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);
    nameBuf.copy(cdh, 46);
    cdHeaders.push(cdh);

    offset += lh.length;
  }

  const cdTotalSize = cdHeaders.reduce((sum, h) => sum + h.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdTotalSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

function createPointShapefile(lon: number, lat: number, name: string) {
  const shp = Buffer.alloc(100 + 28);
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE((100 + 28) / 2, 24);
  shp.writeInt32LE(1000, 28);
  shp.writeInt32LE(1, 32);
  shp.writeDoubleLE(lon, 36);
  shp.writeDoubleLE(lat, 44);
  shp.writeDoubleLE(lon, 52);
  shp.writeDoubleLE(lat, 60);

  shp.writeInt32BE(1, 100);
  shp.writeInt32BE(10, 104);
  shp.writeInt32LE(1, 108);
  shp.writeDoubleLE(lon, 112);
  shp.writeDoubleLE(lat, 120);

  const shx = Buffer.alloc(100 + 8);
  shx.writeInt32BE(9994, 0);
  shx.writeInt32BE((100 + 8) / 2, 24);
  shx.writeInt32LE(1000, 28);
  shx.writeInt32LE(1, 32);
  shx.writeInt32BE(50, 100);
  shx.writeInt32BE(10, 104);

  const fieldLen = 20;
  const headerLen = 32 + 32 + 1;
  const recLen = 1 + fieldLen;
  const dbf = Buffer.alloc(headerLen + recLen);
  dbf[0] = 0x03;
  dbf.writeInt32LE(1, 4);
  dbf.writeInt16LE(headerLen, 8);
  dbf.writeInt16LE(recLen, 10);

  Buffer.from('NAME\0\0\0\0\0\0\0', 'ascii').copy(dbf, 32);
  dbf[32 + 11] = 'C'.charCodeAt(0);
  dbf[32 + 16] = fieldLen;
  dbf[headerLen - 1] = 0x0d;

  dbf[headerLen] = 0x20;
  Buffer.from(name.padEnd(fieldLen, ' '), 'utf8').copy(dbf, headerLen + 1);

  const prj = Buffer.from(
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295],AUTHORITY["EPSG","4326"]]',
    'utf8',
  );

  return { shp, shx, dbf, prj };
}

describe('Map Layers, Vector Tiles & Phase 4 Gate Test (BE-4.5)', () => {
  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let computeQueryService: BlisComputeQueryService;
  let damInspectionRepo: DamInspectionRepository;
  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  let testDb: typeof db;

  const TEST_DB_NAME = `idmis_test_blis_maps_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const BASE_URL = process.env.DATABASE_URL || 'postgresql://idmis:idmis@127.0.0.1:5432/idmis';
  const urlObj = new URL(BASE_URL);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const TEST_DB_URL = urlObj.toString();

  // Users
  const SYSTEM_USER_ID = crypto.randomUUID();
  const NATIONAL_ADMIN_ID = crypto.randomUUID();
  const HADEJIA_OFFICER_ID = crypto.randomUUID();
  const APPROVER_B_ID = crypto.randomUUID();
  const CHAD_OFFICER_ID = crypto.randomUUID();
  const KANO_OFFICER_ID = crypto.randomUUID();

  // Roles
  const NATIONAL_ROLE_ID = crypto.randomUUID();
  const BASIN_ROLE_ID = crypto.randomUUID();
  const SCHEME_ROLE_ID = crypto.randomUUID();

  // RBDAs & Basins
  const HJ_RBDA_ID = crypto.randomUUID();
  const CHAD_RBDA_ID = crypto.randomUUID();
  const HJ_BASIN_ID = crypto.randomUUID();
  const CHAD_BASIN_ID = crypto.randomUUID();

  // Schemes & Plots
  const KANO_SCHEME_ID = crypto.randomUUID();
  const HADEJIA_SCHEME_ID = crypto.randomUUID();
  const KANO_SECTOR_ID = crypto.randomUUID();
  const HADEJIA_SECTOR_ID = crypto.randomUUID();
  const KANO_PLOT_ID = crypto.randomUUID();
  const HADEJIA_PLOT_ID = crypto.randomUUID();

  // Assets
  const TIGA_DAM_ID = crypto.randomUUID();
  const CHAD_DAM_ID = crypto.randomUUID();
  const ST_DISCHARGE_1_ID = crypto.randomUUID();
  const ST_DISCHARGE_2_ID = crypto.randomUUID();
  const ST_DISCHARGE_3_ID = crypto.randomUUID();
  const CHAD_STATION_ID = crypto.randomUUID();

  let paramWaterLevelId: string;
  let layerTypeCatchmentId: string;
  let hazardHighId: string;
  let stDischargeId: string;

  let nationalToken: string;
  let hadejiaOfficerToken: string;
  let approverBToken: string;
  let chadOfficerToken: string;
  let kanoOfficerToken: string;

  beforeAll(async () => {
    adminClient = postgres(BASE_URL, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(TEST_DB_URL);
    testDb = setDatabaseUrl(TEST_DB_URL);
    process.env.DATABASE_URL = TEST_DB_URL;

    const { migrate } = await import('@idmis/db');
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
    computeQueryService = app.get(BlisComputeQueryService);
    damInspectionRepo = app.get(DamInspectionRepository);

    const now = new Date().toISOString();

    // 0. Seed System User
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system.maps@idmis.gov.ng',
      passwordHash: 'dummy-hash',
      fullName: 'System User Maps',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Seed Lookups
    const [ltLayerType] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'map_layer_type',
        name: 'Map Layer Type',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    const [lvCatchment] = await testDb
      .insert(lookupValue)
      .values({
        id: crypto.randomUUID(),
        lookupTypeId: ltLayerType.id,
        code: 'catchment_boundary',
        label: 'Catchment Boundary',
        sortOrder: 1,
      })
      .returning();
    layerTypeCatchmentId = lvCatchment.id;

    const [ltHazard] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'dam_hazard_class',
        name: 'Dam Hazard Class',
        module: 'blis',
        isSystem: true,
      })
      .returning();

    const [lvHazardHigh] = await testDb
      .insert(lookupValue)
      .values({
        id: crypto.randomUUID(),
        lookupTypeId: ltHazard.id,
        code: 'high',
        label: 'High Hazard',
        sortOrder: 1,
      })
      .returning();
    hazardHighId = lvHazardHigh.id;

    const [ltStationType] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'station_type',
        name: 'Station Type',
        module: 'blis',
      })
      .returning();

    const [lvDischarge] = await testDb
      .insert(lookupValue)
      .values({
        id: crypto.randomUUID(),
        lookupTypeId: ltStationType.id,
        code: 'discharge',
        label: 'Discharge',
        sortOrder: 1,
      })
      .returning();
    stDischargeId = lvDischarge.id;

    // 2. Seed Parameter
    const [pWaterLevel] = await testDb
      .insert(parameter)
      .values({
        id: crypto.randomUUID(),
        code: 'WL',
        name: 'Water Level',
        defaultUnit: 'm',
      })
      .returning();
    paramWaterLevelId = pWaterLevel.id;

    // 3. Seed Organisations (RBDAs & Schemes)
    await testDb.insert(organisation).values([
      {
        id: HJ_RBDA_ID,
        code: 'HJRBDA',
        name: "Hadejia-Jama'are River Basin Development Authority",
        type: 'rbda',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_RBDA_ID,
        code: 'CBDA',
        name: 'Chad Basin Development Authority',
        type: 'rbda',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SCHEME_ID,
        code: 'KRIP',
        name: 'Kano River Irrigation Project',
        type: 'scheme',
        geom: 'SRID=4326;POLYGON((8.5 11.9, 8.6 11.9, 8.6 12.0, 8.5 12.0, 8.5 11.9))',
        irrigableAreaHa: '15000.000',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: HADEJIA_SCHEME_ID,
        code: 'HVIP',
        name: 'Hadejia Valley Irrigation Project',
        type: 'scheme',
        geom: 'SRID=4326;POLYGON((10.0 12.4, 10.1 12.4, 10.1 12.5, 10.0 12.5, 10.0 12.4))',
        irrigableAreaHa: '12000.000',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_ID,
        parentId: KANO_SCHEME_ID,
        code: 'KRIP-SEC-1',
        name: 'Kano Sector 1',
        type: 'sector',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: HADEJIA_SECTOR_ID,
        parentId: HADEJIA_SCHEME_ID,
        code: 'HVIP-SEC-1',
        name: 'Hadejia Sector 1',
        type: 'sector',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 4. Seed Basins
    await testDb.insert(basin).values([
      {
        id: HJ_BASIN_ID,
        code: 'HJ-BASIN',
        name: "Hadejia-Jama'are Sub-Basin",
        rbdaId: HJ_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_BASIN_ID,
        code: 'CHAD-BASIN',
        name: 'Lake Chad Basin Proper',
        rbdaId: CHAD_RBDA_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 5. Seed Dams
    await testDb.insert(dam).values([
      {
        id: TIGA_DAM_ID,
        code: 'DAM-TIGA',
        name: 'Tiga Dam',
        basinId: HJ_BASIN_ID,
        geom: 'SRID=4326;POINT(8.6 11.5)',
        heightM: '48.00',
        reservoirCapacityMcm: '1874.000',
        completionYear: 1974,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_DAM_ID,
        code: 'DAM-ALAU',
        name: 'Alau Dam',
        basinId: CHAD_BASIN_ID,
        geom: 'SRID=4326;POINT(13.2 11.7)',
        heightM: '18.00',
        reservoirCapacityMcm: '112.000',
        completionYear: 1987,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 6. Seed Stations (3 in HJ Basin, 1 in Chad)
    await testDb.insert(station).values([
      {
        id: ST_DISCHARGE_1_ID,
        code: 'ST-HJ-01',
        name: 'Wudil Gauge Station',
        basinId: HJ_BASIN_ID,
        stationTypeId: stDischargeId,
        river: 'Hadejia',
        geom: 'SRID=4326;POINT(8.84 11.79)',
        isActive: true,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: ST_DISCHARGE_2_ID,
        code: 'ST-HJ-02',
        name: 'Challawa River Station',
        basinId: HJ_BASIN_ID,
        stationTypeId: stDischargeId,
        river: 'Challawa',
        geom: 'SRID=4326;POINT(8.51 11.88)',
        isActive: true,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: ST_DISCHARGE_3_ID,
        code: 'ST-HJ-03',
        name: 'Hadejia Town River Station',
        basinId: HJ_BASIN_ID,
        stationTypeId: stDischargeId,
        river: 'Hadejia',
        geom: 'SRID=4326;POINT(10.04 12.45)',
        isActive: true,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: CHAD_STATION_ID,
        code: 'ST-CHAD-01',
        name: 'Ngadda River Gauge',
        basinId: CHAD_BASIN_ID,
        stationTypeId: stDischargeId,
        river: 'Ngadda',
        geom: 'SRID=4326;POINT(13.15 11.83)',
        isActive: true,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 7. Seed Plots (Kano plot in Kano scheme, Hadejia plot in Hadejia scheme)
    await testDb.insert(plot).values([
      {
        id: KANO_PLOT_ID,
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        plotCode: 'KRIP-SEC1-001',
        geom: 'SRID=4326;POLYGON((8.52 11.95, 8.53 11.95, 8.53 11.96, 8.52 11.96, 8.52 11.95))',
        areaHa: '2.500',
        status: 'approved',
        submittedAt: now,
        submittedBy: SYSTEM_USER_ID,
        approvedAt: now,
        approvedBy: SYSTEM_USER_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: HADEJIA_PLOT_ID,
        schemeId: HADEJIA_SCHEME_ID,
        sectorId: HADEJIA_SECTOR_ID,
        plotCode: 'HVIP-SEC1-001',
        geom: 'SRID=4326;POLYGON((10.02 12.46, 10.03 12.46, 10.03 12.47, 10.02 12.47, 10.02 12.46))',
        areaHa: '3.000',
        status: 'approved',
        submittedAt: now,
        submittedBy: SYSTEM_USER_ID,
        approvedAt: now,
        approvedBy: SYSTEM_USER_ID,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 8. Seed Users, Roles & Assignments
    await testDb.insert(appUser).values([
      {
        id: NATIONAL_ADMIN_ID,
        email: 'national.maps@idmis.gov.ng',
        passwordHash: 'dummy-hash',
        fullName: 'National Map Admin',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: HADEJIA_OFFICER_ID,
        email: 'hj.officer@idmis.gov.ng',
        passwordHash: 'dummy-hash',
        fullName: 'Hadejia Basin Officer',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: APPROVER_B_ID,
        email: 'approver.b.maps@idmis.gov.ng',
        passwordHash: 'dummy-hash',
        fullName: 'Inspector Approver B',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: CHAD_OFFICER_ID,
        email: 'chad.officer@idmis.gov.ng',
        passwordHash: 'dummy-hash',
        fullName: 'Chad Basin Officer',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano.officer@idmis.gov.ng',
        passwordHash: 'dummy-hash',
        fullName: 'Kano Scheme Officer',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await testDb.insert(role).values([
      {
        id: NATIONAL_ROLE_ID,
        key: 'national_maps_admin',
        name: 'National Maps Admin',
        isSystem: true,
      },
      {
        id: BASIN_ROLE_ID,
        key: 'basin_officer_maps',
        name: 'Basin Officer Maps',
        isSystem: true,
      },
      {
        id: SCHEME_ROLE_ID,
        key: 'scheme_officer_maps',
        name: 'Scheme Officer Maps',
        isSystem: true,
      },
    ]);

    // Role permissions
    const nationalPerms = [
      permissions.BLIS_MAP_MANAGE,
      permissions.BLIS_MAP_READ,
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_DAM_MANAGE,
      permissions.BLIS_MEASUREMENT_READ,
      permissions.BLIS_MEASUREMENT_IMPORT,
      permissions.BLIS_INSPECTION_RECORD,
      permissions.BLIS_INSPECTION_APPROVE,
      permissions.SLIS_PLOT_READ,
      permissions.CORE_ORGANISATION_READ,
      permissions.ME_INDICATOR_READ,
      permissions.ME_INDICATOR_MANAGE,
    ];

    await testDb.insert(rolePermission).values(
      nationalPerms.map((p) => ({
        roleId: NATIONAL_ROLE_ID,
        permission: p,
      })),
    );

    const basinPerms = [
      permissions.BLIS_MAP_MANAGE,
      permissions.BLIS_MAP_READ,
      permissions.BLIS_BASIN_READ,
      permissions.BLIS_DAM_MANAGE,
      permissions.BLIS_MEASUREMENT_READ,
      permissions.BLIS_MEASUREMENT_IMPORT,
      permissions.BLIS_INSPECTION_RECORD,
      permissions.BLIS_INSPECTION_APPROVE,
      permissions.SLIS_PLOT_READ,
      permissions.CORE_ORGANISATION_READ,
    ];

    await testDb.insert(rolePermission).values(
      basinPerms.map((p) => ({
        roleId: BASIN_ROLE_ID,
        permission: p,
      })),
    );

    await testDb.insert(rolePermission).values([
      { roleId: SCHEME_ROLE_ID, permission: permissions.SLIS_PLOT_READ },
      { roleId: SCHEME_ROLE_ID, permission: permissions.CORE_ORGANISATION_READ },
    ]);

    // Assignments
    await testDb.insert(assignment).values([
      {
        id: crypto.randomUUID(),
        userId: NATIONAL_ADMIN_ID,
        roleId: NATIONAL_ROLE_ID,
        module: 'blis',
        scopeType: 'national',
        validFromOn: '2025-01-01',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: HADEJIA_OFFICER_ID,
        roleId: BASIN_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
        validFromOn: '2025-01-01',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: APPROVER_B_ID,
        roleId: BASIN_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
        validFromOn: '2025-01-01',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: CHAD_OFFICER_ID,
        roleId: BASIN_ROLE_ID,
        module: 'blis',
        scopeType: 'rbda',
        scopeOrgId: CHAD_RBDA_ID,
        validFromOn: '2025-01-01',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        roleId: SCHEME_ROLE_ID,
        module: 'blis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        validFromOn: '2025-01-01',
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Tokens
    const createToken = async (userId: string) => {
      const sessId = crypto.randomUUID();
      const familyId = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sessId,
        familyId,
        userId,
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: now,
      });
      const { accessToken } = await tokenService.createAccessToken(userId, sessId);
      return accessToken;
    };

    nationalToken = await createToken(NATIONAL_ADMIN_ID);
    hadejiaOfficerToken = await createToken(HADEJIA_OFFICER_ID);
    approverBToken = await createToken(APPROVER_B_ID);
    chadOfficerToken = await createToken(CHAD_OFFICER_ID);
    kanoOfficerToken = await createToken(KANO_OFFICER_ID);

    // Ensure partitions for 2026
    await testDb.execute(sql`SELECT blis.ensure_measurement_partition(2026);`);
    await damInspectionRepo.refreshMvDamStatus(testDb);
    await testDb.execute(sql`SELECT blis.refresh_mv_latest_reading();`);
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  // =========================================================================
  // Part 1: GeoJSON Upload into map_layer + map_feature
  // =========================================================================
  describe('1. GeoJSON Layer Upload', () => {
    it('uploads valid GeoJSON FeatureCollection in Nigeria coordinates', async () => {
      const geojsonPayload = {
        name: 'Hadejia Wetlands Catchment',
        layerTypeId: layerTypeCatchmentId,
        basinId: HJ_BASIN_ID,
        sourceSrid: 4326,
        details: 'Wetland catchment boundary',
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Zone A', zone_code: 'Z-01' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [10.0, 12.4],
                    [10.1, 12.4],
                    [10.1, 12.5],
                    [10.0, 12.5],
                    [10.0, 12.4],
                  ],
                ],
              },
            },
            {
              type: 'Feature',
              properties: { name: 'Monitoring Point 1' },
              geometry: {
                type: 'Point',
                coordinates: [10.05, 12.45],
              },
            },
          ],
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/geojson',
        headers: {
          authorization: `Bearer ${hadejiaOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: geojsonPayload,
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.name).toBe('Hadejia Wetlands Catchment');
      expect(data.featureCount).toBe(2);
      expect(data.sourceSrid).toBe(4326);
      expect(Number(data.areaKm2)).toBeGreaterThan(0);

      // Verify records in DB
      const [layer] = await testDb.select().from(mapLayer).where(eq(mapLayer.id, data.id));
      expect(layer).toBeDefined();
      expect(layer.sourceSrid).toBe(4326);

      const features = await testDb
        .select()
        .from(mapFeature)
        .where(eq(mapFeature.layerId, data.id));
      expect(features.length).toBe(2);
    });

    it('rejects GeoJSON with coordinates outside Nigeria bounding box with HTTP 400', async () => {
      const outOfBoundsPayload = {
        name: 'Foreign Layer',
        layerTypeId: layerTypeCatchmentId,
        sourceSrid: 4326,
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'London UK' },
              geometry: {
                type: 'Point',
                coordinates: [-0.12, 51.5], // London UK
              },
            },
          ],
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/geojson',
        headers: {
          authorization: `Bearer ${nationalToken}`,
          'content-type': 'application/json',
        },
        payload: outOfBoundsPayload,
      });

      expect(res.statusCode).toBe(400);
      const err = res.json();
      expect(err.detail || err.message).toContain('Coordinates out of Nigeria bounding box');
    });
  });

  // =========================================================================
  // Part 2: Shapefile Upload & Zip Security Hardening
  // =========================================================================
  describe('2. Zipped Shapefile Upload & Security Hardening', () => {
    it('uploads valid zipped shapefile (.shp, .shx, .dbf, .prj)', async () => {
      const { shp, shx, dbf, prj } = createPointShapefile(8.84, 11.79, 'Wudil Gauge Point');
      const zip = createSimpleZip([
        { name: 'wudil.shp', content: shp },
        { name: 'wudil.shx', content: shx },
        { name: 'wudil.dbf', content: dbf },
        { name: 'wudil.prj', content: prj },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/shapefile',
        headers: {
          authorization: `Bearer ${hadejiaOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Wudil Gauge Point Layer',
          layerTypeId: layerTypeCatchmentId,
          basinId: HJ_BASIN_ID,
          zipBase64: zip.toString('base64'),
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.name).toBe('Wudil Gauge Point Layer');
      expect(data.featureCount).toBe(1);
      expect(data.sourceSrid).toBe(4326);
    });

    it('rejects zip archive with directory traversal path (..)', async () => {
      const { shp, shx, dbf, prj } = createPointShapefile(8.84, 11.79, 'Wudil Point');
      const zip = createSimpleZip([
        { name: '../traversal.shp', content: shp },
        { name: 'wudil.shx', content: shx },
        { name: 'wudil.dbf', content: dbf },
        { name: 'wudil.prj', content: prj },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/shapefile',
        headers: {
          authorization: `Bearer ${nationalToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Traversal Attack Layer',
          layerTypeId: layerTypeCatchmentId,
          zipBase64: zip.toString('base64'),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('Directory traversal detected');
    });

    it('rejects zip archive with absolute path', async () => {
      const { shp, shx, dbf, prj } = createPointShapefile(8.84, 11.79, 'Wudil Point');
      const zip = createSimpleZip([
        { name: '/etc/evil.shp', content: shp },
        { name: 'wudil.shx', content: shx },
        { name: 'wudil.dbf', content: dbf },
        { name: 'wudil.prj', content: prj },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/shapefile',
        headers: {
          authorization: `Bearer ${nationalToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Absolute Path Attack Layer',
          layerTypeId: layerTypeCatchmentId,
          zipBase64: zip.toString('base64'),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('Absolute path detected');
    });

    it('rejects zip archive missing required files (.prj)', async () => {
      const { shp, shx, dbf } = createPointShapefile(8.84, 11.79, 'Wudil Point');
      const zip = createSimpleZip([
        { name: 'wudil.shp', content: shp },
        { name: 'wudil.shx', content: shx },
        { name: 'wudil.dbf', content: dbf },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/shapefile',
        headers: {
          authorization: `Bearer ${nationalToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Missing PRJ Layer',
          layerTypeId: layerTypeCatchmentId,
          zipBase64: zip.toString('base64'),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('missing required files');
    });

    it('rejects zip archive exceeding 50 entries', async () => {
      const entries = Array.from({ length: 51 }, (_, i) => ({
        name: `file_${i}.txt`,
        content: Buffer.from(`content ${i}`),
      }));
      const zip = createSimpleZip(entries);

      const res = await app.inject({
        method: 'POST',
        url: '/blis/map/layers/shapefile',
        headers: {
          authorization: `Bearer ${nationalToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Too Many Files Layer',
          layerTypeId: layerTypeCatchmentId,
          zipBase64: zip.toString('base64'),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail || res.json().message).toContain('more than 50 entries');
    });
  });

  // =========================================================================
  // Part 3: Vector Tiles & Layer Scope Isolation
  // =========================================================================
  describe('3. Dynamic Vector Tiles & Scope Isolation', () => {
    it('returns 400 for out-of-range tile coordinates (z > 18 or x/y >= 2^z)', async () => {
      const resZ = await app.inject({
        method: 'GET',
        url: '/map/tiles/plots/20/0/0.mvt',
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(resZ.statusCode).toBe(400);

      const resCoord = await app.inject({
        method: 'GET',
        url: '/map/tiles/plots/2/5/0.mvt', // For z=2, max coord is 3
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(resCoord.statusCode).toBe(400);
    });

    it('returns 204 No Content for empty tile (e.g. tile with no features)', async () => {
      // Tile at z=10 in the Atlantic ocean
      const res = await app.inject({
        method: 'GET',
        url: '/map/tiles/stations/10/0/0.mvt',
        headers: { authorization: `Bearer ${nationalToken}` },
      });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    });

    it('enforces Kano plot isolation: Hadejia officer requesting tile containing Kano plot returns 204', async () => {
      // Tile containing Kano point (lon 8.52, lat 11.95) at z=12
      // x: Math.floor((8.52 + 180) / 360 * 2^12) = 2145
      // latRad = 11.95 * Math.PI / 180
      // y: Math.floor((1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * 2^12) = 1912
      const z = 12;
      const lon = 8.52;
      const lat = 11.95;
      const n = Math.pow(2, z);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
      );

      // 1. Kano officer requesting Kano plot tile receives 200 OK with vector tile buffer
      const resKano = await app.inject({
        method: 'GET',
        url: `/map/tiles/plots/${z}/${x}/${y}.mvt`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resKano.statusCode).toBe(200);
      expect(resKano.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
      expect(resKano.rawPayload.length).toBeGreaterThan(0);

      // 2. Hadejia officer requesting same tile returns 204 No Content (cannot see Kano plots!)
      const resHadejia = await app.inject({
        method: 'GET',
        url: `/map/tiles/plots/${z}/${x}/${y}.mvt`,
        headers: { authorization: `Bearer ${hadejiaOfficerToken}` },
      });
      expect(resHadejia.statusCode).toBe(204);
    });

    it('enforces RBDA scope on stations: Hadejia officer sees Hadejia stations, Chad officer returns 204', async () => {
      // Tile containing Wudil station (lon 8.84, lat 11.79) at z=12
      const z = 12;
      const lon = 8.84;
      const lat = 11.79;
      const n = Math.pow(2, z);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
      );

      // Hadejia officer sees Wudil station
      const resHj = await app.inject({
        method: 'GET',
        url: `/blis/map/tiles/stations/${z}/${x}/${y}.mvt`,
        headers: { authorization: `Bearer ${hadejiaOfficerToken}` },
      });
      expect(resHj.statusCode).toBe(200);
      expect(resHj.rawPayload.length).toBeGreaterThan(0);

      // Chad officer requesting same tile returns 204 No Content (outside Chad RBDA scope)
      const resChad = await app.inject({
        method: 'GET',
        url: `/blis/map/tiles/stations/${z}/${x}/${y}.mvt`,
        headers: { authorization: `Bearer ${chadOfficerToken}` },
      });
      expect(resChad.statusCode).toBe(204);
    });
  });

  // =========================================================================
  // Part 4: Phase 4 Gate Test (End-to-End through API as basin_officer)
  // =========================================================================
  describe('4. Phase 4 Gate Test (End-to-End)', () => {
    it('executes full Phase 4 workflow: station readings import -> monthly aggregates -> dam safety inspection approval -> vector tiles -> Indicator 5 compute', async () => {
      const now = new Date().toISOString();

      // -----------------------------------------------------------------------
      // Step A: Import 1 Year of Readings for 3 Stations via worker commit
      // -----------------------------------------------------------------------
      const dummyFileId = crypto.randomUUID();
      await testDb.insert(file).values({
        id: dummyFileId,
        storageKey: 'imports/blis-readings-gate-test.csv',
        originalName: 'readings_gate_test.csv',
        mimeType: 'text/csv',
        sizeBytes: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        scanStatus: 'clean',
        createdBy: HADEJIA_OFFICER_ID,
        createdAt: now,
        updatedBy: HADEJIA_OFFICER_ID,
        updatedAt: now,
      });

      const batchId = crypto.randomUUID();
      await testDb.insert(importBatch).values({
        id: batchId,
        dataset: 'blis.measurement',
        fileId: dummyFileId,
        status: 'validated',
        rbdaId: HJ_RBDA_ID,
        totalRows: 36, // 12 months * 3 stations
        validRows: 36,
        errorRows: 0,
        committedRows: 0,
        createdBy: HADEJIA_OFFICER_ID,
        createdAt: now,
        updatedAt: now,
      });

      // Generate 1 reading per month in 2026 for each of the 3 stations
      const stations = [ST_DISCHARGE_1_ID, ST_DISCHARGE_2_ID, ST_DISCHARGE_3_ID];
      const importRowsToInsert: Array<typeof importRow.$inferInsert> = [];
      let rowNum = 1;

      for (const stId of stations) {
        for (let m = 1; m <= 12; m++) {
          const monthStr = String(m).padStart(2, '0');
          const observedAt = `2026-${monthStr}-15T12:00:00.000Z`;
          const val = (2.5 + m * 0.1).toFixed(4); // Deterministic decimal reading

          importRowsToInsert.push({
            id: crypto.randomUUID(),
            batchId,
            rowNumber: rowNum++,
            rawData: {
              stationId: stId,
              parameterCode: 'WL',
              observedAt,
              value: val,
              unit: 'm',
              quality: 'checked',
            },
            parsedData: {
              stationId: stId,
              parameterId: paramWaterLevelId,
              observedAt,
              value: val,
              unit: 'm',
              quality: 'checked',
            },
            status: 'valid',
            errors: [],
          });
        }
      }

      await testDb.insert(importRow).values(importRowsToInsert);

      // Run worker commit directly
      await testDb.execute(sql`
        INSERT INTO blis.measurement (
          id, station_id, parameter_id, observed_at, value, unit, quality, source, import_batch_id, created_by
        )
        SELECT
          r.id,
          (r.parsed_data->>'stationId')::uuid,
          (r.parsed_data->>'parameterId')::uuid,
          (r.parsed_data->>'observedAt')::timestamptz,
          (r.parsed_data->>'value')::numeric,
          r.parsed_data->>'unit',
          r.parsed_data->>'quality',
          'import',
          r.batch_id,
          ${HADEJIA_OFFICER_ID}::uuid
        FROM core.import_row r
        WHERE r.batch_id = ${batchId}::uuid AND r.status = 'valid'
        ON CONFLICT (station_id, parameter_id, observed_at)
        DO UPDATE SET
          value = EXCLUDED.value,
          unit = EXCLUDED.unit,
          quality = EXCLUDED.quality,
          source = 'import',
          import_batch_id = EXCLUDED.import_batch_id;
      `);
      await testDb.execute(sql`SELECT blis.refresh_mv_latest_reading();`);
      await testDb
        .update(importBatch)
        .set({
          status: 'committed',
          committedRows: 36,
        })
        .where(eq(importBatch.id, batchId));

      // -----------------------------------------------------------------------
      // Step B: Verify Monthly Aggregates via API as exact decimal strings
      // -----------------------------------------------------------------------
      const readingsRes = await app.inject({
        method: 'GET',
        url: `/blis/stations/${ST_DISCHARGE_1_ID}/readings?parameter=WL&interval=month&from=2026-01-01&to=2026-12-31`,
        headers: { authorization: `Bearer ${hadejiaOfficerToken}` },
      });

      expect(readingsRes.statusCode).toBe(200);
      const readingsData = readingsRes.json();
      expect(readingsData.items.length).toBe(12);

      // Verify exact decimal strings (no float arithmetic)
      for (const item of readingsData.items) {
        expect(typeof item.mean).toBe('string');
        expect(typeof item.min).toBe('string');
        expect(typeof item.max).toBe('string');
        expect(typeof item.count).toBe('number');
        expect(item.count).toBe(1);
      }

      // -----------------------------------------------------------------------
      // Step C: Submit & Approve Dam Safety Inspection for Tiga Dam
      // -----------------------------------------------------------------------
      const inspRes = await app.inject({
        method: 'POST',
        url: '/blis/dam-inspections',
        headers: {
          authorization: `Bearer ${hadejiaOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          damId: TIGA_DAM_ID,
          inspectedOn: '2026-06-15',
          nextDueOn: '2027-06-15',
          hazardClassId: hazardHighId,
          components: [
            { component: 'dam_body', ratingId: hazardHighId, ratingCode: 'good' },
            { component: 'spillway_1', ratingId: hazardHighId, ratingCode: 'good' },
          ],
        },
      });

      expect(inspRes.statusCode).toBe(201);
      const inspection = inspRes.json();
      expect(inspection.status).toBe('draft');

      // Submit inspection
      const submitRes = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspection.id}/submit`,
        headers: {
          authorization: `Bearer ${hadejiaOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: { version: inspection.version },
      });
      expect(submitRes.statusCode).toBe(200);
      const submittedInsp = submitRes.json();
      expect(submittedInsp.status).toBe('submitted');

      // Approve by second authorized user (no self-approval)
      const approveRes = await app.inject({
        method: 'POST',
        url: `/blis/dam-inspections/${inspection.id}/approve`,
        headers: {
          authorization: `Bearer ${approverBToken}`,
          'content-type': 'application/json',
        },
        payload: { version: submittedInsp.version },
      });
      expect(approveRes.statusCode).toBe(200);
      const approvedInsp = approveRes.json();
      expect(approvedInsp.status).toBe('approved');
      expect(approvedInsp.meetsStandard).toBe(true);

      // Verify mv_dam_status updated
      const latestDamStatus = await damInspectionRepo.getLatestDamStatus(TIGA_DAM_ID, testDb);
      expect(latestDamStatus).not.toBeNull();
      expect(latestDamStatus!.meetsStandard).toBe(true);
      expect(latestDamStatus!.isOverdue).toBe(false);

      // -----------------------------------------------------------------------
      // Step D: Vector Tiles for the Basin Contain the Updated Dam
      // -----------------------------------------------------------------------
      // Tiga Dam at (lon 8.6, lat 11.5) at z=12
      const z = 12;
      const lon = 8.6;
      const lat = 11.5;
      const n = Math.pow(2, z);
      const x = Math.floor(((lon + 180) / 360) * n);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
      );

      const damTileRes = await app.inject({
        method: 'GET',
        url: `/map/tiles/dams/${z}/${x}/${y}.mvt`,
        headers: { authorization: `Bearer ${hadejiaOfficerToken}` },
      });
      expect(damTileRes.statusCode).toBe(200);
      expect(damTileRes.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
      expect(damTileRes.rawPayload.length).toBeGreaterThan(0);

      // -----------------------------------------------------------------------
      // Step E: Indicator 5 Recomputes & Reflects Newly Approved Dam
      // -----------------------------------------------------------------------
      const ind5HjRes = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'rbda',
        scopeOrgId: HJ_RBDA_ID,
      });
      expect(ind5HjRes.status).toBe('computed');
      expect(ind5HjRes.total).toBe('1'); // Tiga Dam approved and meets standard

      const ind5NatRes = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'national',
      });
      expect(ind5NatRes.status).toBe('computed');
      expect(ind5NatRes.total).toBe('1');

      // Chad RBDA has 0 safe dams
      const ind5ChadRes = await computeQueryService.getDamsSafe('2026-12-31', {
        scopeType: 'rbda',
        scopeOrgId: CHAD_RBDA_ID,
      });
      expect(ind5ChadRes.status).toBe('computed');
      expect(ind5ChadRes.total).toBe('0');
    });
  });
});
