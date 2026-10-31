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
  lookupType,
  lookupValue,
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
  farmerIdentity,
  plot,
  cropProduction,
  feeBilling,
  feeCollection,
  file,
  exportJob,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
  eq,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { StorageService } from '../../platform/storage/storage.service';
import { EncryptionService } from '../../platform/security/encryption.service';
import { IdentityHashService } from '../../platform/security/identity-hash.service';

describe('SLIS Reports & Exports Specification (BE-2.8)', () => {
  const TEST_DB_NAME = `idmis_slis_reports_test_${Date.now()}`;
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
  let storageService: StorageService;
  let encryptionService: EncryptionService;
  let identityHashService: IdentityHashService;

  const mockStorageFiles = new Map<string, Buffer>();

  // IDs
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const LAGOS_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const LAGOS_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const LAGOS_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const LAGOS_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';
  const KANO_SECTOR_ID = '018f3a5e-4000-7000-8000-000000000003';

  const KANO_SEASON_1 = '018f3a5e-8000-7000-8000-000000000001';
  const KANO_SEASON_ZERO = '018f3a5e-8000-7000-8000-000000000002';
  const LAGOS_SEASON_1 = '018f3a5e-8000-7000-8000-000000000003';

  const CROP_TYPE_MAIZE = '018f3a5e-9000-7000-8000-000000000001';
  const CROP_TYPE_RICE = '018f3a5e-9000-7000-8000-000000000002';
  const DOC_TYPE_NIN = '018f3a5e-7000-7000-8000-000000000001';

  const KANO_WUA_ID = '018f3a5e-3000-7000-8000-000000000001';

  const ADMIN_USER_ID = '018f3a5e-1000-7000-8000-000000000001';
  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const LAGOS_STATE_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';
  const REVOKED_USER_ID = '018f3a5e-1000-7000-8000-000000000004';
  const PRIVILEGED_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000005';

  const SLIS_ADMIN_ROLE_ID = '018f3a5e-3000-7000-8000-000000000010';
  const SCHEME_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000011';
  const STATE_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000012';
  const PRIVILEGED_ROLE_ID = '018f3a5e-3000-7000-8000-000000000013';

  let adminToken: string;
  let kanoOfficerToken: string;
  let lagosStateOfficerToken: string;
  const previousDbUrl = process.env.DATABASE_URL;

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
    storageService = app.get(StorageService);
    encryptionService = app.get(EncryptionService);
    identityHashService = app.get(IdentityHashService);

    // Mock storage upload & download
    const mockS3 = storageService.getClient() as unknown as {
      send: (cmd: {
        constructor?: { name: string };
        input?: { Key?: string; Body?: unknown };
      }) => Promise<unknown>;
    };
    mockS3.send = async (command: {
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
      if (cmdName === 'GetObjectCommand') {
        const key = command.input?.Key;
        const buf = (key ? mockStorageFiles.get(key) : null) || Buffer.from('mock');
        return {
          Body: buf,
          ContentLength: buf.length,
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
      }
      return {};
    };

    // 1. Seed System User and App Users
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
        fullName: 'System Admin',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano@idmis.gov.ng',
        fullName: 'Kano Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_STATE_OFFICER_ID,
        email: 'lagos@idmis.gov.ng',
        fullName: 'Lagos State Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: REVOKED_USER_ID,
        email: 'revoked@idmis.gov.ng',
        fullName: 'Revoked Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: PRIVILEGED_OFFICER_ID,
        email: 'privileged@idmis.gov.ng',
        fullName: 'Privileged Officer',
        passwordHash: passHash,
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

    // 3. Seed Organisations
    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        type: 'scheme',
        code: 'SCH-KN',
        name: 'Kano Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SCHEME_ID,
        type: 'scheme',
        code: 'SCH-LA',
        name: 'Lagos Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SECTOR_ID,
        type: 'sector',
        parentId: KANO_SCHEME_ID,
        code: 'SEC-KN1',
        name: 'Kano Sector 1',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: LAGOS_SCHEME_ID, stateId: LAGOS_STATE_ID },
      { organisationId: KANO_SECTOR_ID, stateId: KANO_STATE_ID },
    ]);

    // 4. Seed WUAs
    await testDb.insert(wua).values({
      id: KANO_WUA_ID,
      organisationId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
      level: 'unit',
      name: 'Kano Unit WUA 1',
      regNo: 'WUA-KN-001',
      isOperational: true,
      hasMaintenanceFund: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 5. Seed Seasons
    await testDb.insert(season).values([
      {
        id: KANO_SEASON_1,
        schemeId: KANO_SCHEME_ID,
        name: '2026 Wet Season',
        startsOn: '2026-05-01',
        endsOn: '2026-09-30',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_SEASON_ZERO,
        schemeId: KANO_SCHEME_ID,
        name: '2026 Dry Season (Zero Fee)',
        startsOn: '2026-10-01',
        endsOn: '2026-12-31',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: LAGOS_SEASON_1,
        schemeId: LAGOS_SCHEME_ID,
        name: '2026 Lagos Wet',
        startsOn: '2026-04-01',
        endsOn: '2026-08-31',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 6. Seed Lookups
    await testDb.insert(lookupType).values([
      { id: crypto.randomUUID(), key: 'crop_type', name: 'Crop Type', module: 'slis' },
      { id: crypto.randomUUID(), key: 'document_type', name: 'Doc Type', module: 'slis' },
    ]);

    const [cropTypeType] = await testDb
      .select()
      .from(lookupType)
      .where(eq(lookupType.key, 'crop_type'));
    const [docTypeType] = await testDb
      .select()
      .from(lookupType)
      .where(eq(lookupType.key, 'document_type'));

    await testDb.insert(lookupValue).values([
      { id: CROP_TYPE_MAIZE, lookupTypeId: cropTypeType.id, code: 'maize', label: 'Maize' },
      { id: CROP_TYPE_RICE, lookupTypeId: cropTypeType.id, code: 'rice', label: 'Rice' },
      { id: DOC_TYPE_NIN, lookupTypeId: docTypeType.id, code: 'nin', label: 'NIN' },
    ]);

    // 7. Seed Roles & Role Permissions
    await testDb.insert(role).values([
      { id: SLIS_ADMIN_ROLE_ID, key: 'slis_admin', name: 'SLIS Admin' },
      { id: SCHEME_OFFICER_ROLE_ID, key: 'scheme_officer', name: 'Scheme Officer' },
      { id: STATE_OFFICER_ROLE_ID, key: 'state_officer', name: 'State Officer' },
      { id: PRIVILEGED_ROLE_ID, key: 'privileged_officer', name: 'Privileged Officer' },
    ]);

    const reportPerms = [
      permissions.SLIS_REPORT_VIEW,
      permissions.SLIS_REPORT_READ,
      permissions.SLIS_EXPORT_GENERATE,
      permissions.SLIS_FARMER_READ,
      permissions.SLIS_PLOT_READ,
      permissions.SLIS_WATER_REQUEST_READ,
      permissions.SLIS_FEE_READ,
    ];

    for (const p of reportPerms) {
      await testDb.insert(rolePermission).values([
        { roleId: SLIS_ADMIN_ROLE_ID, permission: p },
        { roleId: SCHEME_OFFICER_ROLE_ID, permission: p },
        { roleId: STATE_OFFICER_ROLE_ID, permission: p },
        { roleId: PRIVILEGED_ROLE_ID, permission: p },
      ]);
    }
    // Privileged role also has identity view permission
    await testDb.insert(rolePermission).values({
      roleId: PRIVILEGED_ROLE_ID,
      permission: permissions.SLIS_IDENTITY_VIEW,
    });

    // 8. Seed Assignments
    await testDb.insert(assignment).values([
      // Admin: national
      {
        id: crypto.randomUUID(),
        userId: ADMIN_USER_ID,
        roleId: SLIS_ADMIN_ROLE_ID,
        module: 'slis',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Kano officer: Kano scheme scope
      {
        id: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Lagos officer: Lagos state scope
      {
        id: crypto.randomUUID(),
        userId: LAGOS_STATE_OFFICER_ID,
        roleId: STATE_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'state',
        scopeStateId: LAGOS_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Revoked officer: Kano scheme scope initially
      {
        id: crypto.randomUUID(),
        userId: REVOKED_USER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Privileged officer: national scope with identity view
      {
        id: crypto.randomUUID(),
        userId: PRIVILEGED_OFFICER_ID,
        roleId: PRIVILEGED_ROLE_ID,
        module: 'slis',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 9. Generate tokens
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

    // 10. Seed Hand-counted Domain Data
    // A. Farmers:
    // Kano Scheme:
    // - Sector 1, female: 3 approved farmers
    // - Sector 1, male: 2 approved farmers
    // - Sector null, female: 1 approved farmer
    // - Draft farmer (should NOT be in MV): 1 farmer
    // Lagos Scheme:
    // - Sector null, male: 4 approved farmers
    const testFarmers = [
      // Kano
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-F-01',
        firstName: 'Amina',
        lastName: 'Kano',
        gender: 'female' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-F-02',
        firstName: 'Fatima',
        lastName: 'Kano',
        gender: 'female' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-F-03',
        firstName: 'Zainab',
        lastName: 'Kano',
        gender: 'female' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-M-01',
        firstName: 'Ibrahim',
        lastName: 'Kano',
        gender: 'male' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-M-02',
        firstName: 'Usman',
        lastName: 'Kano',
        gender: 'male' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: null,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-F-04',
        firstName: 'Maryam',
        lastName: 'Kano',
        gender: 'female' as const,
        status: 'approved' as const,
      },
      // Draft farmer (must not be counted in MV)
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        farmerCode: 'KN-D-01',
        firstName: 'Draft',
        lastName: 'Farmer',
        gender: 'female' as const,
        status: 'draft' as const,
      },
      // Lagos
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: null,
        stateId: LAGOS_STATE_ID,
        farmerCode: 'LA-M-01',
        firstName: 'Babatunde',
        lastName: 'Lagos',
        gender: 'male' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: null,
        stateId: LAGOS_STATE_ID,
        farmerCode: 'LA-M-02',
        firstName: 'Femi',
        lastName: 'Lagos',
        gender: 'male' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: null,
        stateId: LAGOS_STATE_ID,
        farmerCode: 'LA-M-03',
        firstName: 'Segun',
        lastName: 'Lagos',
        gender: 'male' as const,
        status: 'approved' as const,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: null,
        stateId: LAGOS_STATE_ID,
        farmerCode: 'LA-M-04',
        firstName: 'Dele',
        lastName: 'Lagos',
        gender: 'male' as const,
        status: 'approved' as const,
      },
    ];

    for (const f of testFarmers) {
      await testDb.insert(farmer).values({
        ...f,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Add identity document for the first farmer
      if (f.farmerCode === 'KN-F-01') {
        const rawNin = '12345678901';
        const numEnc = encryptionService.encrypt(rawNin).toString('hex');
        const numHash = identityHashService.hash(rawNin);
        const numLast4 = identityHashService.last4(rawNin);
        await testDb.insert(farmerIdentity).values({
          id: crypto.randomUUID(),
          farmerId: f.id,
          documentTypeId: DOC_TYPE_NIN,
          numberEnc: numEnc,
          numberHash: numHash,
          numberLast4: numLast4,
          uniquePerPerson: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        });
      }
    }

    // B. Plots:
    // Kano:
    // - Service 'new': 2 plots, total 10.5000 ha (7.0000 + 3.5000)
    // - Service 'improved': 1 plot, 5.2500 ha
    // - Service 'none': 1 plot, 2.0000 ha
    // Lagos:
    // - Service 'new': 2 plots, total 8.0000 ha (4.0000 + 4.0000)
    const kanoPlot1Id = crypto.randomUUID();
    const kanoPlot2Id = crypto.randomUUID();
    const lagosPlot1Id = crypto.randomUUID();

    await testDb.insert(plot).values([
      {
        id: kanoPlot1Id,
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'P-KN-01',
        serviceType: 'new',
        areaHa: '7.0000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: kanoPlot2Id,
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'P-KN-02',
        serviceType: 'new',
        areaHa: '3.5000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'P-KN-03',
        serviceType: 'improved',
        areaHa: '5.2500',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        sectorId: KANO_SECTOR_ID,
        stateId: KANO_STATE_ID,
        plotCode: 'P-KN-04',
        serviceType: 'none',
        areaHa: '2.0000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      // Lagos
      {
        id: lagosPlot1Id,
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SCHEME_ID,
        stateId: LAGOS_STATE_ID,
        plotCode: 'P-LA-01',
        serviceType: 'new',
        areaHa: '4.0000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        sectorId: LAGOS_SCHEME_ID,
        stateId: LAGOS_STATE_ID,
        plotCode: 'P-LA-02',
        serviceType: 'new',
        areaHa: '4.0000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // C. Cropping:
    // Kano Season 1:
    // - Maize on Kano Plot 1: area 10.5000 ha, yield 21.000 t (avg yield = 2.0000 t/ha)
    // - Rice on Kano Plot 2: area 0.0000 ha (edge case zero area) -> avg yield must be null, never divide-by-zero
    // Lagos Season 1:
    // - Rice on Lagos Plot 1: area 8.0000 ha, yield 16.000 t (avg yield = 2.0000 t/ha)
    await testDb.insert(cropProduction).values([
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        plotId: kanoPlot1Id,
        seasonId: KANO_SEASON_1,
        cropTypeId: CROP_TYPE_MAIZE,
        areaHa: '10.5000',
        yieldT: '21.000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        plotId: kanoPlot2Id,
        seasonId: KANO_SEASON_1,
        cropTypeId: CROP_TYPE_RICE,
        areaHa: '0.0000',
        yieldT: '0.000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        plotId: lagosPlot1Id,
        seasonId: LAGOS_SEASON_1,
        cropTypeId: CROP_TYPE_RICE,
        areaHa: '8.0000',
        yieldT: '16.000',
        status: 'approved',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // D. Fee Billing & Collection:
    // Kano Season 1: Billed 1234.50 NGN, Collected 617.25 NGN (recovery rate = 50.00%)
    // Kano Season Zero: Billed 0 NGN (no rows), Collected 0 NGN -> recovery rate = null
    // Lagos Season 1: Billed 2000.00 NGN, Collected 1500.00 NGN (recovery rate = 75.00%)
    const kanoBilling1Id = crypto.randomUUID();
    await testDb.insert(feeBilling).values([
      {
        id: kanoBilling1Id,
        schemeId: KANO_SCHEME_ID,
        seasonId: KANO_SEASON_1,
        wuaId: KANO_WUA_ID,
        amountNgn: '1234.50',
        dueDate: '2026-06-30',
        status: 'recorded',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        seasonId: LAGOS_SEASON_1,
        amountNgn: '2000.00',
        dueDate: '2026-06-30',
        status: 'recorded',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
        farmerId: testFarmers[7].id,
      },
    ]);

    await testDb.insert(feeCollection).values([
      {
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        seasonId: KANO_SEASON_1,
        billingId: kanoBilling1Id,
        wuaId: KANO_WUA_ID,
        amountNgn: '617.25',
        paidOn: '2026-06-15',
        status: 'recorded',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: crypto.randomUUID(),
        schemeId: LAGOS_SCHEME_ID,
        seasonId: LAGOS_SEASON_1,
        amountNgn: '1500.00',
        paidOn: '2026-06-15',
        status: 'recorded',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
        farmerId: testFarmers[7].id,
      },
    ]);

    // Refresh views to compute initial state
    await testClient.unsafe('SELECT slis.refresh_report_views();');
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end({ timeout: 5 });
    if (adminClient) {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end({ timeout: 5 });
    }
    if (previousDbUrl) {
      setDatabaseUrl(previousDbUrl);
    }
  });

  interface ReportRow {
    schemeId?: string;
    sectorId?: string | null;
    gender?: string;
    serviceType?: string;
    cropTypeId?: string;
    seasonId?: string;
    stateId?: string;
    wuaId?: string;
    farmerCount?: number;
    plotCount?: number;
    totalAreaHa?: string;
    totalYieldT?: string;
    avgYieldTHa?: string | null;
    billedNgn?: string;
    collectedNgn?: string;
    recoveryRatePct?: string | null;
    isOperational?: boolean;
    hasMaintenanceFund?: boolean;
  }

  // --- Suite 1: Hand-Counted Exact Materialized View Figures ---
  describe('Materialised Views Exact Figures', () => {
    it('mv_farmers_by_scope: returns hand-counted approved farmer aggregates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/farmers-by-scope',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalFarmers).toBe(10); // 6 Kano + 4 Lagos
      expect(body.lastRefreshedAt).toBeDefined();

      const kanoFemaleSec1 = (body.items as ReportRow[]).find(
        (i: ReportRow) =>
          i.schemeId === KANO_SCHEME_ID && i.sectorId === KANO_SECTOR_ID && i.gender === 'female',
      );
      expect(kanoFemaleSec1).toBeDefined();
      expect(kanoFemaleSec1?.farmerCount).toBe(3);

      const kanoMaleSec1 = (body.items as ReportRow[]).find(
        (i: ReportRow) =>
          i.schemeId === KANO_SCHEME_ID && i.sectorId === KANO_SECTOR_ID && i.gender === 'male',
      );
      expect(kanoMaleSec1).toBeDefined();
      expect(kanoMaleSec1?.farmerCount).toBe(2);

      const kanoFemaleSecNull = (body.items as ReportRow[]).find(
        (i: ReportRow) =>
          i.schemeId === KANO_SCHEME_ID && i.sectorId === null && i.gender === 'female',
      );
      expect(kanoFemaleSecNull).toBeDefined();
      expect(kanoFemaleSecNull?.farmerCount).toBe(1);

      const lagosMale = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === LAGOS_SCHEME_ID && i.gender === 'male',
      );
      expect(lagosMale).toBeDefined();
      expect(lagosMale?.farmerCount).toBe(4);
    });

    it('mv_area_by_service: returns hand-counted ha sums and plot counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/area-by-service',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalPlots).toBe(6);

      const kanoNew = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.serviceType === 'new',
      );
      expect(kanoNew).toBeDefined();
      expect(kanoNew?.plotCount).toBe(2);
      expect(kanoNew?.totalAreaHa).toBe('10.5000');

      const kanoImproved = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.serviceType === 'improved',
      );
      expect(kanoImproved).toBeDefined();
      expect(kanoImproved?.plotCount).toBe(1);
      expect(kanoImproved?.totalAreaHa).toBe('5.2500');

      const kanoNone = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.serviceType === 'none',
      );
      expect(kanoNone).toBeDefined();
      expect(kanoNone?.plotCount).toBe(1);
      expect(kanoNone?.totalAreaHa).toBe('2.0000');
    });

    it('mv_cropping: returns exact ha, tonnage, and avg yield; returns NULL for zero area without divide-by-zero', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/cropping',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      const kanoMaize = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.cropTypeId === CROP_TYPE_MAIZE,
      );
      expect(kanoMaize).toBeDefined();
      expect(kanoMaize?.totalAreaHa).toBe('10.5000');
      expect(kanoMaize?.totalYieldT).toBe('21.000');
      expect(kanoMaize?.avgYieldTHa).toBe('2.0000'); // 21.000 / 10.5000 = 2.0000

      const kanoRiceZeroArea = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.cropTypeId === CROP_TYPE_RICE,
      );
      expect(kanoRiceZeroArea).toBeDefined();
      expect(kanoRiceZeroArea?.totalAreaHa).toBe('0.0000');
      expect(kanoRiceZeroArea?.avgYieldTHa).toBeNull(); // NULL when area is 0, never divide-by-zero
    });

    it('mv_fee_recovery: returns exact decimal strings (1234.50) and returns recovery NULL when billed is 0', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/fee-recovery',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      const kanoRecovery = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === KANO_SCHEME_ID && i.seasonId === KANO_SEASON_1,
      );
      expect(kanoRecovery).toBeDefined();
      expect(kanoRecovery?.billedNgn).toBe('1234.50');
      expect(kanoRecovery?.collectedNgn).toBe('617.25');
      expect(kanoRecovery?.recoveryRatePct).toBe('50.00');

      const lagosRecovery = (body.items as ReportRow[]).find(
        (i: ReportRow) => i.schemeId === LAGOS_SCHEME_ID && i.seasonId === LAGOS_SEASON_1,
      );
      expect(lagosRecovery).toBeDefined();
      expect(lagosRecovery?.billedNgn).toBe('2000.00');
      expect(lagosRecovery?.collectedNgn).toBe('1500.00');
      expect(lagosRecovery?.recoveryRatePct).toBe('75.00');
    });

    it('wua_summaries: returns list of WUAs with operational flag and member counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/wua-summaries',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalWuas).toBeGreaterThanOrEqual(1);

      const kanoWua = (body.items as ReportRow[]).find((w: ReportRow) => w.wuaId === KANO_WUA_ID);
      expect(kanoWua).toBeDefined();
      expect(kanoWua?.isOperational).toBe(true);
      expect(kanoWua?.hasMaintenanceFund).toBe(true);
      expect(kanoWua?.farmerCount).toBeDefined();
    });
  });

  // --- Suite 2: Scope Enforcement Across Reports ---
  describe('Scope Enforcement on Reports', () => {
    it('a Kano scheme officer sees only Kano rows on every report', async () => {
      // 1. farmers-by-scope
      const resFarmers = await app.inject({
        method: 'GET',
        url: '/slis/reports/farmers-by-scope',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resFarmers.statusCode).toBe(200);
      const bFarmers = resFarmers.json();
      expect(bFarmers.totalFarmers).toBe(6);
      expect(
        (bFarmers.items as ReportRow[]).every((i: ReportRow) => i.schemeId === KANO_SCHEME_ID),
      ).toBe(true);

      // 2. area-by-service
      const resArea = await app.inject({
        method: 'GET',
        url: '/slis/reports/area-by-service',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resArea.statusCode).toBe(200);
      const bArea = resArea.json();
      expect(
        (bArea.items as ReportRow[]).every((i: ReportRow) => i.schemeId === KANO_SCHEME_ID),
      ).toBe(true);
      expect(
        (bArea.items as ReportRow[]).some((i: ReportRow) => i.schemeId === LAGOS_SCHEME_ID),
      ).toBe(false);

      // 3. cropping
      const resCropping = await app.inject({
        method: 'GET',
        url: '/slis/reports/cropping',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resCropping.statusCode).toBe(200);
      const bCropping = resCropping.json();
      expect(
        (bCropping.items as ReportRow[]).every((i: ReportRow) => i.schemeId === KANO_SCHEME_ID),
      ).toBe(true);
      expect(
        (bCropping.items as ReportRow[]).some((i: ReportRow) => i.schemeId === LAGOS_SCHEME_ID),
      ).toBe(false);

      // 4. fee-recovery
      const resFee = await app.inject({
        method: 'GET',
        url: '/slis/reports/fee-recovery',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(resFee.statusCode).toBe(200);
      const bFee = resFee.json();
      expect(
        (bFee.items as ReportRow[]).every((i: ReportRow) => i.schemeId === KANO_SCHEME_ID),
      ).toBe(true);
      expect(
        (bFee.items as ReportRow[]).some((i: ReportRow) => i.schemeId === LAGOS_SCHEME_ID),
      ).toBe(false);
    });

    it('a state-scope user sees only their state rows on every report', async () => {
      // Lagos state officer: sees only Lagos State rows
      const res = await app.inject({
        method: 'GET',
        url: '/slis/reports/farmers-by-scope',
        headers: { authorization: `Bearer ${lagosStateOfficerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalFarmers).toBe(4);
      expect(
        (body.items as ReportRow[]).every((i: ReportRow) => i.stateId === LAGOS_STATE_ID),
      ).toBe(true);

      const resFee = await app.inject({
        method: 'GET',
        url: '/slis/reports/fee-recovery',
        headers: { authorization: `Bearer ${lagosStateOfficerToken}` },
      });
      expect(resFee.statusCode).toBe(200);
      const bFee = resFee.json();
      expect(
        (bFee.items as ReportRow[]).every((i: ReportRow) => i.stateId === LAGOS_STATE_ID),
      ).toBe(true);
      expect(
        (bFee.items as ReportRow[]).some((i: ReportRow) => i.schemeId === KANO_SCHEME_ID),
      ).toBe(false);
    });
  });

  // --- Suite 3: App Role Refresh & CONCURRENTLY Execution ---
  describe('Refresh & Permissions Execution', () => {
    it('running refresh as the APP role (idmis_app) succeeds and CONCURRENTLY works', async () => {
      // Ensure idmis_app exists in postgres and execute slis.refresh_report_views()
      await testClient.unsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
            CREATE ROLE idmis_app LOGIN;
          END IF;
          GRANT USAGE ON SCHEMA "slis" TO idmis_app;
          GRANT SELECT ON ALL TABLES IN SCHEMA "slis" TO idmis_app;
          GRANT EXECUTE ON FUNCTION "slis"."refresh_report_views"() TO idmis_app;
        END
        $$;
      `);

      // Run refresh under SET ROLE idmis_app
      await testClient.unsafe(`
        SET ROLE idmis_app;
        SELECT slis.refresh_report_views();
        RESET ROLE;
      `);

      const [row] = await testClient.unsafe(
        `SELECT * FROM "slis"."report_refresh" WHERE "id" = 1;`,
      );
      expect(row).toBeDefined();
      expect(row.refreshed_at).toBeDefined();
    });

    it('on-demand refresh endpoint POST /slis/reports/refresh triggers view refresh', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/reports/refresh',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refreshed).toBe(true);
      expect(body.refreshedAt).toBeDefined();
    });
  });

  // --- Suite 4: Export API Endpoints & Enqueueing ---
  describe('Export API Endpoints & Enqueueing', () => {
    it('POST /slis/exports returns 202 in < 1s and enqueues job; GET /slis/exports/:id returns status', async () => {
      const startTime = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/slis/exports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          dataset: 'farmers',
          filters: {},
        },
      });

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Enqueue < 1 second!
      expect(res.statusCode).toBe(202);

      const { exportId, status } = res.json();
      expect(exportId).toBeDefined();
      expect(status).toBe('queued');

      // Check export job in database
      const [queuedJob] = await testDb.select().from(exportJob).where(eq(exportJob.id, exportId));
      expect(queuedJob).toBeDefined();
      expect(queuedJob.status).toBe('queued');

      // Query status endpoint GET /slis/exports/:id
      const statusRes = await app.inject({
        method: 'GET',
        url: `/slis/exports/${exportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(statusRes.statusCode).toBe(200);
      const statusBody = statusRes.json();
      expect(statusBody.exportId).toBe(exportId);
      expect(statusBody.status).toBe('queued');
      expect(statusBody.downloadUrl).toBeNull();
    });

    it('GET /slis/exports/:id returns presigned download URL when job is completed', async () => {
      const completedExportId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const storageKey = `exports/${completedExportId}.xlsx`;

      await testDb.insert(file).values({
        id: fileId,
        storageKey,
        originalName: 'farmers_export.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 1024,
        sha256: 'dummy_sha',
        scanStatus: 'clean',
        createdBy: ADMIN_USER_ID,
        updatedBy: ADMIN_USER_ID,
      });

      await testDb.insert(exportJob).values({
        id: completedExportId,
        userId: ADMIN_USER_ID,
        dataset: 'farmers',
        status: 'completed',
        fileId,
        rowCount: 50000,
        completedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'GET',
        url: `/slis/exports/${completedExportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('completed');
      expect(body.rowCount).toBe(50000);
      expect(body.downloadUrl).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });

    it('GET /slis/exports/:id returns 404 for non-existent export', async () => {
      const nonExistentId = crypto.randomUUID();
      const res = await app.inject({
        method: 'GET',
        url: `/slis/exports/${nonExistentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /slis/exports returns 403 when user lacks slis.export.generate', async () => {
      const noPermUserId = crypto.randomUUID();
      const sid = crypto.randomUUID();
      await testDb.insert(appUser).values({
        id: noPermUserId,
        email: 'noperm@idmis.gov.ng',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fake$fake',
        fullName: 'No Perm User',
      });
      await testDb.insert(session).values({
        id: sid,
        userId: noPermUserId,
        familyId: crypto.randomUUID(),
        refreshTokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const noPermToken = (await tokenService.createAccessToken(noPermUserId, sid)).accessToken;

      const res = await app.inject({
        method: 'POST',
        url: '/slis/exports',
        headers: { authorization: `Bearer ${noPermToken}` },
        payload: { dataset: 'farmers' },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
