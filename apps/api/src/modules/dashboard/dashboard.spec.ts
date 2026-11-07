import 'reflect-metadata';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import {
  appUser,
  assignment,
  lga,
  organisation,
  organisationState,
  role,
  rolePermission,
  session,
  state,
  ward,
  wua,
  season,
  farmer,
  plot,
  feeBilling,
  feeCollection,
  basin,
  dam,
  damSafetyInspection,
  resultsFramework,
  indicator,
  indicatorValue,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { RedisService } from '../../platform/redis/redis.service';
import { DashboardService } from './services/dashboard.service';

describe('Dashboard Endpoints Specification (BE-5.1)', () => {
  const TEST_DB_NAME = `idmis_dashboards_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  let app: NestFastifyApplication;
  let tokenService: TokenService;
  let dashboardService: DashboardService;
  let redisService: RedisService;

  // IDs
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const LAGOS_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const LAGOS_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const LAGOS_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const LAGOS_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';
  const KANO_SECTOR_1_ID = '018f3a5e-4000-7000-8000-000000000003';
  const KANO_SECTOR_2_ID = '018f3a5e-4000-7000-8000-000000000004';
  const LAGOS_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000005';

  const KANO_SEASON_1 = '018f3a5e-8000-7000-8000-000000000001';
  const KANO_WUA_ID = '018f3a5e-3000-7000-8000-000000000001';
  const LAGOS_WUA_ID = '018f3a5e-3000-7000-8000-000000000002';

  const BASIN_ID = '018f3a5e-7000-7000-8000-000000000001';
  const KANO_DAM_ID = '018f3a5e-7000-7000-8000-000000000010';
  const LAGOS_DAM_ID = '018f3a5e-7000-7000-8000-000000000020';

  const INDICATOR_ID = '018f3a5e-9000-7000-8000-000000000001';

  const ADMIN_USER_ID = '018f3a5e-1000-7000-8000-000000000001';
  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const LAGOS_STATE_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';

  const ROLE_ADMIN_ID = '018f3a5e-3000-7000-8000-000000000010';
  const ROLE_KANO_SCHEME_ID = '018f3a5e-3000-7000-8000-000000000011';
  const ROLE_LAGOS_STATE_ID = '018f3a5e-3000-7000-8000-000000000012';

  let adminToken: string;
  let kanoOfficerToken: string;
  let lagosStateOfficerToken: string;

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

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
    dashboardService = app.get(DashboardService);
    redisService = app.get(RedisService);

    // 1. Seed System User and Users
    const passHash = await argon2.hash('Secret1234!');
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        fullName: 'System User',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: ADMIN_USER_ID,
        email: 'admin@idmis.gov.ng',
        fullName: 'National Admin',
        passwordHash: passHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano_officer@idmis.gov.ng',
        fullName: 'Kano Scheme Officer',
        passwordHash: passHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_OFFICER_ID,
        email: 'lagos_coord@idmis.gov.ng',
        fullName: 'Lagos State Coordinator',
        passwordHash: passHash,
        totpConfirmedAt: new Date().toISOString(),
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 2. Seed States, LGAs, Wards
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

    await testDb.insert(lga).values([
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KN-LGA1', name: 'Kano Municipal' },
      { id: LAGOS_LGA_ID, stateId: LAGOS_STATE_ID, code: 'LA-LGA1', name: 'Ikeja' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KN-W1', name: 'Kano Ward 1' },
      { id: LAGOS_WARD_ID, lgaId: LAGOS_LGA_ID, code: 'LA-W1', name: 'Ikeja Ward 1' },
    ]);

    // 3. Seed Organisations (Schemes & Sectors)
    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        type: 'scheme',
        code: 'KN-SCHEME',
        name: 'Kano Irrigation Scheme',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        type: 'scheme',
        code: 'LA-SCHEME',
        name: 'Lagos Irrigation Scheme',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_1_ID,
        type: 'sector',
        parentId: KANO_SCHEME_ID,
        code: 'KN-SEC-1',
        name: 'Kano Sector East',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_2_ID,
        type: 'sector',
        parentId: KANO_SCHEME_ID,
        code: 'KN-SEC-2',
        name: 'Kano Sector West',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SECTOR_ID,
        type: 'sector',
        parentId: LAGOS_SCHEME_ID,
        code: 'LA-SEC-1',
        name: 'Lagos Sector 1',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
    ]);

    // 4. Seed Seasons & WUAs
    await testDb.insert(season).values({
      id: KANO_SEASON_1,
      schemeId: KANO_SCHEME_ID,
      name: '2026 Wet Season',
      startsOn: '2026-05-01',
      endsOn: '2026-09-30',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(wua).values([
      {
        id: KANO_WUA_ID,
        regNo: 'WUA-KN-01',
        name: 'Kano Farmers WUA',
        organisationId: KANO_SCHEME_ID,
        level: 'unit',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_WUA_ID,
        regNo: 'WUA-LA-01',
        name: 'Lagos Farmers WUA',
        organisationId: LAGOS_SCHEME_ID,
        level: 'unit',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 5. Seed Roles & Permissions
    await testDb.insert(role).values([
      { id: ROLE_ADMIN_ID, key: 'system_admin', name: 'System Admin' },
      { id: ROLE_KANO_SCHEME_ID, key: 'kano_scheme_officer', name: 'Kano Scheme Officer' },
      { id: ROLE_LAGOS_STATE_ID, key: 'lagos_state_officer', name: 'Lagos State Officer' },
    ]);

    const perms = [permissions.DASHBOARD_VIEW, permissions.SLIS_REPORT_VIEW];
    for (const p of perms) {
      await testDb.insert(rolePermission).values([
        { roleId: ROLE_ADMIN_ID, permission: p },
        { roleId: ROLE_KANO_SCHEME_ID, permission: p },
        { roleId: ROLE_LAGOS_STATE_ID, permission: p },
      ]);
    }

    // 6. Seed Assignments
    await testDb.insert(assignment).values([
      // Admin: national
      {
        id: crypto.randomUUID(),
        userId: ADMIN_USER_ID,
        roleId: ROLE_ADMIN_ID,
        module: 'core',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Kano officer: Kano scheme scope
      {
        id: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        roleId: ROLE_KANO_SCHEME_ID,
        module: 'core',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Lagos officer: Lagos state scope
      {
        id: crypto.randomUUID(),
        userId: LAGOS_STATE_OFFICER_ID,
        roleId: ROLE_LAGOS_STATE_ID,
        module: 'core',
        scopeType: 'state',
        scopeStateId: LAGOS_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 7. Seed SLIS Data (Farmers, Plots, Fees)
    // Kano Sector 1: 3 female, 2 male
    // Kano Sector 2: 1 female, 4 male
    // Lagos Scheme: 2 female, 3 male
    const farmersToInsert = [
      ...Array.from({ length: 3 }, () => ({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_1_ID,
        stateId: KANO_STATE_ID,
        lgaId: KANO_LGA_ID,
        wardId: KANO_WARD_ID,
        farmerCode: `KN-F-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Kano',
        lastName: 'Female 1',
        gender: 'female' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
      ...Array.from({ length: 2 }, () => ({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_1_ID,
        stateId: KANO_STATE_ID,
        lgaId: KANO_LGA_ID,
        wardId: KANO_WARD_ID,
        farmerCode: `KN-M-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Kano',
        lastName: 'Male 1',
        gender: 'male' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
      ...Array.from({ length: 1 }, () => ({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_2_ID,
        stateId: KANO_STATE_ID,
        lgaId: KANO_LGA_ID,
        wardId: KANO_WARD_ID,
        farmerCode: `KN-F2-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Kano',
        lastName: 'Female 2',
        gender: 'female' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
      ...Array.from({ length: 4 }, () => ({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_2_ID,
        stateId: KANO_STATE_ID,
        lgaId: KANO_LGA_ID,
        wardId: KANO_WARD_ID,
        farmerCode: `KN-M2-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Kano',
        lastName: 'Male 2',
        gender: 'male' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
      ...Array.from({ length: 2 }, () => ({
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SECTOR_ID,
        stateId: LAGOS_STATE_ID,
        lgaId: LAGOS_LGA_ID,
        wardId: LAGOS_WARD_ID,
        farmerCode: `LA-F-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Lagos',
        lastName: 'Female',
        gender: 'female' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
      ...Array.from({ length: 3 }, () => ({
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SECTOR_ID,
        stateId: LAGOS_STATE_ID,
        lgaId: LAGOS_LGA_ID,
        wardId: LAGOS_WARD_ID,
        farmerCode: `LA-M-${crypto.randomUUID().substring(0, 8)}`,
        firstName: 'Lagos',
        lastName: 'Male',
        gender: 'male' as const,
        status: 'approved' as const,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })),
    ];
    await testDb.insert(farmer).values(farmersToInsert);

    // Plots:
    // Kano Scheme:
    // 2 plots of 'new' service type (10.5 ha each = 21.0 ha)
    // 1 plot of 'improved' service type (5.0 ha = 5.0 ha)
    // Lagos Scheme:
    // 2 plots of 'improved' service type (4.0 ha each = 8.0 ha)
    await testDb.insert(plot).values([
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_1_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'KN-PLT-01',
        areaHa: '10.5000',
        serviceType: 'new',
        status: 'approved',
        geom: 'SRID=4326;POLYGON((8.5 11.9, 8.6 11.9, 8.6 12.0, 8.5 12.0, 8.5 11.9))',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_2_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'KN-PLT-02',
        areaHa: '10.5000',
        serviceType: 'new',
        status: 'approved',
        geom: 'SRID=4326;POLYGON((8.6 11.9, 8.7 11.9, 8.7 12.0, 8.6 12.0, 8.6 11.9))',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_1_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'KN-PLT-03',
        areaHa: '5.0000',
        serviceType: 'improved',
        status: 'approved',
        geom: 'SRID=4326;POLYGON((8.7 11.9, 8.8 11.9, 8.8 12.0, 8.7 12.0, 8.7 11.9))',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SECTOR_ID,
        stateId: LAGOS_STATE_ID,
        plotCode: 'LA-PLT-01',
        areaHa: '4.0000',
        serviceType: 'improved',
        status: 'approved',
        geom: 'SRID=4326;POLYGON((3.3 6.5, 3.4 6.5, 3.4 6.6, 3.3 6.6, 3.3 6.5))',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SECTOR_ID,
        stateId: LAGOS_STATE_ID,
        plotCode: 'LA-PLT-02',
        areaHa: '4.0000',
        serviceType: 'improved',
        status: 'approved',
        geom: 'SRID=4326;POLYGON((3.4 6.5, 3.5 6.5, 3.5 6.6, 3.4 6.6, 3.4 6.5))',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Fees:
    // Kano Scheme:
    // Bill 1: 10,000 NGN -> collected 7,000 NGN
    // Lagos Scheme:
    // Bill 2: 5,000 NGN -> collected 5,000 NGN
    const bill1Id = crypto.randomUUID();
    const bill2Id = crypto.randomUUID();
    await testDb.insert(feeBilling).values([
      {
        id: bill1Id,
        schemeId: KANO_SCHEME_ID,
        wuaId: KANO_WUA_ID,
        seasonId: KANO_SEASON_1,
        amountNgn: '10000.00',
        status: 'approved',
        dueDate: '2026-06-10',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: bill2Id,
        schemeId: LAGOS_SCHEME_ID,
        wuaId: LAGOS_WUA_ID,
        seasonId: KANO_SEASON_1,
        amountNgn: '5000.00',
        status: 'approved',
        dueDate: '2026-06-10',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(feeCollection).values([
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        wuaId: KANO_WUA_ID,
        seasonId: KANO_SEASON_1,
        billingId: bill1Id,
        amountNgn: '7000.00',
        paidOn: '2026-05-20',
        receiptNo: 'RCP-KN-01',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        wuaId: LAGOS_WUA_ID,
        seasonId: KANO_SEASON_1,
        billingId: bill2Id,
        amountNgn: '5000.00',
        paidOn: '2026-05-21',
        receiptNo: 'RCP-LA-01',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 8. Seed BLIS Dams and Inspections
    await testDb.insert(basin).values({
      id: BASIN_ID,
      code: 'BASIN-01',
      name: "Hadejia-Jam'are Basin",
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(dam).values([
      {
        id: KANO_DAM_ID,
        code: 'DAM-KN-01',
        name: 'Tiga Dam',
        basinId: BASIN_ID,
        lgaId: KANO_LGA_ID,
        ownerOrgId: KANO_SCHEME_ID,
        geom: 'SRID=4326;POINT(8.5 11.9)',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_DAM_ID,
        code: 'DAM-LA-01',
        name: 'Lagos Coastal Dam',
        basinId: BASIN_ID,
        lgaId: LAGOS_LGA_ID,
        ownerOrgId: LAGOS_SCHEME_ID,
        geom: 'SRID=4326;POINT(3.3 6.5)',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const nowIso = new Date().toISOString();
    await testDb.insert(damSafetyInspection).values([
      {
        id: crypto.randomUUID(),
        damId: KANO_DAM_ID,
        inspectedOn: '2026-01-15',
        meetsStandard: true,
        nextDueOn: '2027-01-15', // Future: NOT overdue
        status: 'approved',
        submittedAt: nowIso,
        submittedBy: SYSTEM_USER_ID,
        approvedAt: nowIso,
        approvedBy: SYSTEM_USER_ID,
        createdAt: nowIso,
        createdBy: SYSTEM_USER_ID,
        updatedAt: nowIso,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        damId: LAGOS_DAM_ID,
        inspectedOn: '2023-01-15',
        meetsStandard: false,
        nextDueOn: '2024-01-15', // Past: OVERDUE
        status: 'approved',
        submittedAt: nowIso,
        submittedBy: SYSTEM_USER_ID,
        approvedAt: nowIso,
        approvedBy: SYSTEM_USER_ID,
        createdAt: nowIso,
        createdBy: SYSTEM_USER_ID,
        updatedAt: nowIso,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 9. Seed M&E Framework, Indicator & Values
    const frameworkId = crypto.randomUUID();
    await testDb.insert(resultsFramework).values({
      id: frameworkId,
      name: 'TRIMING Results Framework',
      version: '1.0',
      isCurrent: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(indicator).values({
      id: INDICATOR_ID,
      frameworkId,
      code: 'IND-AREA-01',
      name: 'Total Irrigated Area (ha)',
      level: 'pdo',
      unit: 'ha',
      method: 'manual',
      endTarget: '5000.0000',
      frequency: 'quarterly',
      disaggregations: [],
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(indicatorValue).values({
      id: crypto.randomUUID(),
      indicatorId: INDICATOR_ID,
      periodYear: 2026,
      periodQuarter: 2,
      scopeType: 'national',
      disaggregation: {},
      value: '2500.0000',
      source: 'manual',
      status: 'approved',
      computedAt: nowIso,
      approvedAt: nowIso,
      approvedBy: SYSTEM_USER_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 10. Refresh all Materialised Views
    await testClient.unsafe('SELECT slis.refresh_report_views();');
    await testClient.unsafe('SELECT blis.refresh_mv_dam_status();');
    await testClient.unsafe('SELECT me.refresh_mv_indicator_matrix();');

    // 11. Generate Tokens
    async function makeToken(userId: string): Promise<string> {
      const sid = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sid,
        userId,
        familyId: crypto.randomUUID(),
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const res = await tokenService.createAccessToken(userId, sid);
      return res.accessToken;
    }

    adminToken = await makeToken(ADMIN_USER_ID);
    kanoOfficerToken = await makeToken(KANO_OFFICER_ID);
    lagosStateOfficerToken = await makeToken(LAGOS_STATE_OFFICER_ID);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  describe('1. Programme Dashboard (GET /dashboards/programme)', () => {
    it('returns programme headline numbers equal to corresponding report views and children totals add up', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/dashboards/programme?year=2026&quarter=2',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.level).toBe('programme');
      expect(data.year).toBe(2026);
      expect(data.quarter).toBe(2);

      // Verify farmers from report view query
      // Kano: 3 female + 2 male (sector 1) + 1 female + 4 male (sector 2) = 10 farmers (4 female, 6 male)
      // Lagos: 2 female + 3 male = 5 farmers (2 female, 3 male)
      // National: 15 farmers (6 female, 9 male)
      expect(data.farmers.total).toBe(15);
      expect(data.farmers.byGender).toEqual({ female: 6, male: 9 });

      // Verify area
      // Kano: 21.0000 new + 5.0000 improved = 26.0000 ha
      // Lagos: 8.0000 improved = 8.0000 ha
      // National: 34.0000 ha (new: 21.0000, improved: 13.0000)
      expect(data.area.totalHa).toBe('34.0000');
      expect(data.area.byServiceType).toEqual({
        new: '21.0000',
        improved: '13.0000',
      });

      // Verify fee recovery
      // Kano: 10,000.00 billed, 7,000.00 collected (70.00%)
      // Lagos: 5,000.00 billed, 5,000.00 collected (100.00%)
      // National: 15,000.00 billed, 12,000.00 collected (80.00%)
      expect(data.feeRecovery.billed).toBe('15000.00');
      expect(data.feeRecovery.collected).toBe('12000.00');
      expect(data.feeRecovery.rate).toBe('80.00');

      // Verify dam status
      // Tiga Dam (Kano): meets standard = true, overdue = false
      // Lagos Dam: meets standard = false, overdue = true
      // National: meetingStandard = 1, notMeetingStandard = 1, overdue = 1, total = 2
      expect(data.damStatus).toEqual({
        meetingStandard: 1,
        notMeetingStandard: 1,
        overdue: 1,
        total: 2,
      });

      // Verify indicator progress
      expect(data.indicatorProgress.length).toBeGreaterThan(0);
      const ind = data.indicatorProgress.find(
        (i: { indicatorCode: string }) => i.indicatorCode === 'IND-AREA-01',
      );
      expect(ind).toBeDefined();
      expect(ind.value).toBe('2500.0000');
      expect(ind.endTarget).toBe('5000.0000');
      expect(ind.pctOfEndTarget).toBe('50.00');

      // Verify lastRefreshedAt per source
      expect(data.lastRefreshedAt.slis).not.toBeNull();
      expect(data.lastRefreshedAt.me).not.toBeNull();
      expect(data.lastRefreshedAt.blis).not.toBeNull();

      // Verify children list (programme -> states) and Additivity
      expect(data.children.length).toBe(2);
      const kanoChild = data.children.find((c: { id: string }) => c.id === KANO_STATE_ID);
      const lagosChild = data.children.find((c: { id: string }) => c.id === LAGOS_STATE_ID);

      expect(kanoChild).toBeDefined();
      expect(kanoChild.type).toBe('state');
      expect(kanoChild.name).toBe('Kano');
      expect(kanoChild.farmers.total).toBe(10);
      expect(kanoChild.area.totalHa).toBe('26.0000');
      expect(kanoChild.feeRecovery.billed).toBe('10000.00');
      expect(kanoChild.damStatus.meetingStandard).toBe(1);

      expect(lagosChild).toBeDefined();
      expect(lagosChild.type).toBe('state');
      expect(lagosChild.name).toBe('Lagos');
      expect(lagosChild.farmers.total).toBe(5);
      expect(lagosChild.area.totalHa).toBe('8.0000');
      expect(lagosChild.feeRecovery.billed).toBe('5000.00');
      expect(lagosChild.damStatus.notMeetingStandard).toBe(1);

      // Exact additive check: sum of children totals add up to the parent
      const sumChildFarmers = data.children.reduce(
        (acc: number, c: { farmers: { total: number } }) => acc + c.farmers.total,
        0,
      );
      expect(sumChildFarmers).toBe(data.farmers.total);

      const sumChildFemaleFarmers = data.children.reduce(
        (acc: number, c: { farmers: { byGender: { female?: number } } }) =>
          acc + (c.farmers.byGender.female || 0),
        0,
      );
      expect(sumChildFemaleFarmers).toBe(data.farmers.byGender.female);

      const sumChildMaleFarmers = data.children.reduce(
        (acc: number, c: { farmers: { byGender: { male?: number } } }) =>
          acc + (c.farmers.byGender.male || 0),
        0,
      );
      expect(sumChildMaleFarmers).toBe(data.farmers.byGender.male);

      const sumChildAreaHa = data.children.reduce(
        (acc: number, c: { area: { totalHa: string } }) => acc + parseFloat(c.area.totalHa),
        0,
      );
      expect(sumChildAreaHa.toFixed(4)).toBe(data.area.totalHa);

      const sumChildBilled = data.children.reduce(
        (acc: number, c: { feeRecovery: { billed: string } }) =>
          acc + parseFloat(c.feeRecovery.billed),
        0,
      );
      expect(sumChildBilled.toFixed(2)).toBe(data.feeRecovery.billed);

      const sumChildCollected = data.children.reduce(
        (acc: number, c: { feeRecovery: { collected: string } }) =>
          acc + parseFloat(c.feeRecovery.collected),
        0,
      );
      expect(sumChildCollected.toFixed(2)).toBe(data.feeRecovery.collected);

      const sumChildDamsTotal = data.children.reduce(
        (acc: number, c: { damStatus: { total: number } }) => acc + c.damStatus.total,
        0,
      );
      expect(sumChildDamsTotal).toBe(data.damStatus.total);

      const sumChildDamsMeeting = data.children.reduce(
        (acc: number, c: { damStatus: { meetingStandard: number } }) =>
          acc + c.damStatus.meetingStandard,
        0,
      );
      expect(sumChildDamsMeeting).toBe(data.damStatus.meetingStandard);
    });
  });

  describe('2. State Dashboard (GET /dashboards/state/:stateId)', () => {
    it('returns state headline numbers and children schemes that sum up to state totals', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${KANO_STATE_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.level).toBe('state');
      expect(data.scopeId).toBe(KANO_STATE_ID);
      expect(data.scopeName).toBe('Kano');

      expect(data.farmers.total).toBe(10);
      expect(data.farmers.byGender).toEqual({ female: 4, male: 6 });
      expect(data.area.totalHa).toBe('26.0000');
      expect(data.feeRecovery.billed).toBe('10000.00');
      expect(data.feeRecovery.collected).toBe('7000.00');
      expect(data.feeRecovery.rate).toBe('70.00');
      expect(data.damStatus).toEqual({
        meetingStandard: 1,
        notMeetingStandard: 0,
        overdue: 0,
        total: 1,
      });

      // Children list (state -> schemes)
      expect(data.children.length).toBe(1);
      const schemeChild = data.children[0];
      expect(schemeChild.type).toBe('scheme');
      expect(schemeChild.id).toBe(KANO_SCHEME_ID);
      expect(schemeChild.name).toBe('Kano Irrigation Scheme');
      expect(schemeChild.farmers.total).toBe(10);
      expect(schemeChild.area.totalHa).toBe('26.0000');
      expect(schemeChild.feeRecovery.billed).toBe('10000.00');
      expect(schemeChild.feeRecovery.collected).toBe('7000.00');
      expect(schemeChild.damStatus.total).toBe(1);
    });
  });

  describe('3. Scheme Dashboard (GET /dashboards/scheme/:schemeId)', () => {
    it('returns scheme headline numbers and children sectors', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/scheme/${KANO_SCHEME_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      expect(data.level).toBe('scheme');
      expect(data.scopeId).toBe(KANO_SCHEME_ID);
      expect(data.scopeName).toBe('Kano Irrigation Scheme');
      expect(data.farmers.total).toBe(10);
      expect(data.area.totalHa).toBe('26.0000');
      expect(data.damStatus.total).toBe(1);

      // Children list (scheme -> sectors)
      expect(data.children.length).toBe(2);
      const sec1 = data.children.find((c: { id: string }) => c.id === KANO_SECTOR_1_ID);
      const sec2 = data.children.find((c: { id: string }) => c.id === KANO_SECTOR_2_ID);

      expect(sec1).toBeDefined();
      expect(sec1.type).toBe('sector');
      expect(sec1.farmers.total).toBe(5); // 3 female, 2 male

      expect(sec2).toBeDefined();
      expect(sec2.type).toBe('sector');
      expect(sec2.farmers.total).toBe(5); // 1 female, 4 male

      // Sum of sectors' farmers equals scheme total farmers
      expect(sec1.farmers.total + sec2.farmers.total).toBe(data.farmers.total);
    });
  });

  describe('4. Scope Isolation (Access Control & 404 Enforcement)', () => {
    it('non-national user cannot open programme dashboard -> 404', async () => {
      const resKano = await app.inject({
        method: 'GET',
        url: '/dashboards/programme',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resKano.statusCode).toBe(404);

      const resLagos = await app.inject({
        method: 'GET',
        url: '/dashboards/programme',
        headers: { authorization: `Bearer ${lagosStateOfficerToken}` },
      });
      expect(resLagos.statusCode).toBe(404);
    });

    it('Kano officer cannot open Lagos state dashboard -> 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${LAGOS_STATE_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('Kano officer cannot open Lagos scheme dashboard -> 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/scheme/${LAGOS_SCHEME_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('Lagos state coordinator cannot open Kano state dashboard -> 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${KANO_STATE_ID}`,
        headers: { authorization: `Bearer ${lagosStateOfficerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('Lagos state coordinator can open Lagos state dashboard -> 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${LAGOS_STATE_ID}`,
        headers: { authorization: `Bearer ${lagosStateOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.scopeId).toBe(LAGOS_STATE_ID);
    });

    it('Non-existent state or scheme returns 404', async () => {
      const fakeId = '018f3a5e-9999-7000-8000-000000000099';
      const resState = await app.inject({
        method: 'GET',
        url: `/dashboards/state/${fakeId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resState.statusCode).toBe(404);

      const resScheme = await app.inject({
        method: 'GET',
        url: `/dashboards/scheme/${fakeId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resScheme.statusCode).toBe(404);
    });
  });

  describe('5. Drill-down Filters', () => {
    it('filters programme by scheme query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/programme?scheme=${KANO_SCHEME_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      // Only Kano farmers and area
      expect(data.farmers.total).toBe(10);
      expect(data.area.totalHa).toBe('26.0000');
    });

    it('filters programme by sector query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/dashboards/programme?sector=${KANO_SECTOR_1_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.farmers.total).toBe(5);
    });
  });

  describe('6. Redis Caching & Invalidation', () => {
    it('caches response in Redis and invalidates on epoch increment', async () => {
      // Clear epoch
      await redisService.set('dashboard:cache:epoch', '1');

      const res1 = await app.inject({
        method: 'GET',
        url: '/dashboards/programme?year=2026&quarter=2',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res1.statusCode).toBe(200);

      // Invalidate cache
      await dashboardService.invalidateCache();

      const newEpoch = await redisService.get('dashboard:cache:epoch');
      expect(Number(newEpoch)).toBeGreaterThan(1);

      // Next request succeeds and re-populates cache under new epoch
      const res2 = await app.inject({
        method: 'GET',
        url: '/dashboards/programme?year=2026&quarter=2',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().level).toBe('programme');
    });
  });
});
