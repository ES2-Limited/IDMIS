import 'reflect-metadata';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import {
  appUser,
  assignment,
  device,
  farmer,
  lga,
  organisation,
  organisationState,
  role,
  rolePermission,
  season,
  session,
  state,
  ward,
  wua,
  feeBilling,
  feeCollection,
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
import { FeeRepository } from './repositories/fee.repository';

describe('SLIS Fees API (FEAT-FEES)', () => {
  const TEST_DB_NAME = `idmis_slis_fee_test_${Date.now()}`;
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

  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const KADUNA_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KADUNA_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const KADUNA_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KADUNA_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';

  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const KADUNA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';

  const SCHEME_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000001';

  let kanoOfficerToken: string;
  let kadunaOfficerToken: string;

  const SEASON_ID = '018f3a5e-7000-7000-8000-000000000001';
  const KANO_FARMER_ID = '018f3a5e-8000-7000-8000-000000000001';
  const KANO_WUA_ID = '018f3a5e-8000-7000-8000-000000000002';
  const KADUNA_FARMER_ID = '018f3a5e-8000-7000-8000-000000000003';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl, { max: 10 });
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-secret-at-least-16-characters-long';
    process.env.IDENTITY_HASH_KEY = '0'.repeat(32);
    process.env.ENCRYPTION_KEY = '0'.repeat(32);

    initAuditWriter();

    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    // 1. Seed System and Officer Users
    const pwHash = await argon2.hash('Password123!');
    await testDb.insert(appUser).values([
      {
        id: SYSTEM_USER_ID,
        email: 'system@idmis.gov.ng',
        passwordHash: pwHash,
        fullName: 'System User',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano_officer@idmis.gov.ng',
        passwordHash: pwHash,
        fullName: 'Kano Officer',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_OFFICER_ID,
        email: 'kaduna_officer@idmis.gov.ng',
        passwordHash: pwHash,
        fullName: 'Kaduna Officer',
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Seed core geography and orgs
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KN',
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_STATE_ID,
        code: 'KD',
        name: 'Kaduna',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(lga).values([
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KN-KMC', name: 'Kano Municipal' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KD-KDN', name: 'Kaduna North' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KN-KMC-01', name: 'Ward 1' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KD-KDN-01', name: 'Ward 1' },
    ]);

    await testDb.insert(organisation).values([
      {
        id: KANO_SCHEME_ID,
        name: 'Kano River Irrigation Scheme',
        code: 'KRIS',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_SCHEME_ID,
        name: 'Hadejia Scheme',
        code: 'HADEJIA',
        type: 'scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_SCHEME_ID, stateId: KADUNA_STATE_ID },
    ]);

    await testDb.insert(season).values({
      id: SEASON_ID,
      schemeId: KANO_SCHEME_ID,
      name: 'Dry Season 2026',
      startsOn: '2026-01-01',
      endsOn: '2026-05-31',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Seed farmers & WUA
    await testDb.insert(farmer).values([
      {
        id: KANO_FARMER_ID,
        farmerCode: 'F-KN-001',
        schemeId: KANO_SCHEME_ID,
        stateId: KANO_STATE_ID,
        wardId: KANO_WARD_ID,
        firstName: 'Aliyu',
        lastName: 'Musa',
        gender: 'male',
        status: 'approved',
        version: 1,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_FARMER_ID,
        farmerCode: 'F-KD-001',
        schemeId: KADUNA_SCHEME_ID,
        stateId: KADUNA_STATE_ID,
        wardId: KADUNA_WARD_ID,
        firstName: 'Ibrahim',
        lastName: 'Sani',
        gender: 'male',
        status: 'approved',
        version: 1,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(wua).values({
      id: KANO_WUA_ID,
      level: 'unit',
      organisationId: KANO_SCHEME_ID,
      stateId: KANO_STATE_ID,
      name: 'Kano Sector 1 WUA',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Role & permissions
    await testDb.insert(role).values({
      id: SCHEME_OFFICER_ROLE_ID,
      key: 'scheme_fee_officer',
      name: 'Scheme Fee Officer',
      description: 'Records and reads fees in scheme',
      isSystem: false,
    });

    await testDb.insert(rolePermission).values([
      { roleId: SCHEME_OFFICER_ROLE_ID, permission: permissions.SLIS_FEE_READ },
      { roleId: SCHEME_OFFICER_ROLE_ID, permission: permissions.SLIS_FEE_RECORD },
    ]);

    await testDb.insert(assignment).values([
      {
        id: '018f3a5e-9000-7000-8000-000000000001',
        userId: KANO_OFFICER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KANO_SCHEME_ID,
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: '018f3a5e-9000-7000-8000-000000000002',
        userId: KADUNA_OFFICER_ID,
        roleId: SCHEME_OFFICER_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeOrgId: KADUNA_SCHEME_ID,
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    const moduleRef = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
    );
    moduleRef.useGlobalFilters(new ProblemDetailsFilter());
    app = moduleRef;
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const kanoSessionId = crypto.randomUUID();
    await testDb.insert(session).values({
      id: kanoSessionId,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });
    kanoOfficerToken = (await tokenService.createAccessToken(KANO_OFFICER_ID, kanoSessionId))
      .accessToken;

    const kadunaSessionId = crypto.randomUUID();
    await testDb.insert(session).values({
      id: kadunaSessionId,
      familyId: crypto.randomUUID(),
      userId: KADUNA_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });
    kadunaOfficerToken = (await tokenService.createAccessToken(KADUNA_OFFICER_ID, kadunaSessionId))
      .accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  describe('POST /slis/fees/billings', () => {
    it('creates a farmer fee billing within user scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/billings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          amountNgn: '15000.00',
          dueDate: '2026-04-30',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.schemeId).toBe(KANO_SCHEME_ID);
      expect(body.farmerId).toBe(KANO_FARMER_ID);
      expect(body.amountNgn).toBe('15000.00');
      expect(body.dueDate).toBe('2026-04-30');
    });

    it('creates a WUA fee billing within user scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/billings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          wuaId: KANO_WUA_ID,
          amountNgn: '50000.00',
          dueDate: '2026-05-15',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.wuaId).toBe(KANO_WUA_ID);
      expect(body.farmerId).toBeNull();
    });

    it('rejects one-of violation when both wuaId and farmerId are provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/billings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          wuaId: KANO_WUA_ID,
          amountNgn: '15000.00',
          dueDate: '2026-04-30',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects creation outside user scope with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/billings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KADUNA_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KADUNA_FARMER_ID,
          amountNgn: '20000.00',
          dueDate: '2026-04-30',
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /slis/fees/billings and GET /slis/fees/billings/:id', () => {
    let billingId: string;

    beforeAll(async () => {
      const [b] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          amountNgn: '25000.00',
          dueDate: '2026-05-01',
          status: 'billed',
          version: 1,
          createdBy: KANO_OFFICER_ID,
          updatedBy: KANO_OFFICER_ID,
        })
        .returning();
      billingId = b.id;
    });

    it('lists billings filtered to user scope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/fees/billings',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.schemeId).toBe(KANO_SCHEME_ID);
      }
    });

    it('retrieves an in-scope billing detail by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/fees/billings/${billingId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(billingId);
      expect(body.amountNgn).toBe('25000.00');
    });

    it('returns 404 for an out-of-scope billing detail', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/fees/billings/${billingId}`,
        headers: { authorization: `Bearer ${kadunaOfficerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /slis/fees/billings/:id', () => {
    let billingId: string;

    beforeAll(async () => {
      const [b] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          amountNgn: '10000.00',
          dueDate: '2026-05-01',
          status: 'billed',
          version: 1,
          createdBy: KANO_OFFICER_ID,
          updatedBy: KANO_OFFICER_ID,
        })
        .returning();
      billingId = b.id;
    });

    it('updates billing with valid If-Match version', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/fees/billings/${billingId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
        },
        payload: {
          amountNgn: '12000.00',
          dueDate: '2026-06-01',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.amountNgn).toBe('12000.00');
      expect(body.version).toBe(2);
    });

    it('rejects stale If-Match with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/fees/billings/${billingId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1', // now stale
        },
        payload: {
          amountNgn: '13000.00',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('returns 404 for an out-of-scope billing update', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/fees/billings/${billingId}`,
        headers: {
          authorization: `Bearer ${kadunaOfficerToken}`,
          'if-match': '2',
        },
        payload: {
          amountNgn: '14000.00',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /slis/fees/collections', () => {
    let billingId: string;

    beforeAll(async () => {
      const [b] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          amountNgn: '30000.00',
          dueDate: '2026-05-01',
          status: 'billed',
          version: 1,
          createdBy: KANO_OFFICER_ID,
          updatedBy: KANO_OFFICER_ID,
        })
        .returning();
      billingId = b.id;
    });

    it('records a fee collection and assigns a unique receipt number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '10000.00',
          paidOn: '2026-03-20',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.receiptNo).toMatch(/^REC-/);
      expect(body.amountNgn).toBe('10000.00');
    });

    it('rejects duplicate receipt number with 409 Conflict', async () => {
      const customReceipt = `REC-TEST-${Date.now()}`;
      const first = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '5000.00',
          paidOn: '2026-03-21',
          receiptNo: customReceipt,
        },
      });
      expect(first.statusCode).toBe(201);

      const duplicate = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '5000.00',
          paidOn: '2026-03-21',
          receiptNo: customReceipt,
        },
      });
      expect(duplicate.statusCode).toBe(409);
      const errBody = JSON.parse(duplicate.payload);
      expect(errBody.status).toBe(409);
      expect(errBody.detail || errBody.message).toContain('Duplicate receipt number');
    });

    it('maps Postgres unique violation (23505) on fee_collection_receipt_no_unique to 409 Conflict', async () => {
      const feeRepo = app.get(FeeRepository);
      const receiptNo = `REC-PG23505-${Date.now()}`;

      // Insert first row directly
      await testDb.insert(feeCollection).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        seasonId: SEASON_ID,
        billingId,
        farmerId: KANO_FARMER_ID,
        amountNgn: '1000.00',
        paidOn: '2026-03-21',
        receiptNo,
        status: 'submitted',
        version: 1,
        createdBy: KANO_OFFICER_ID,
        updatedBy: KANO_OFFICER_ID,
      });

      // Spy on findCollectionByReceiptNo to return null (simulating concurrent race condition)
      const spy = vi
        .spyOn(feeRepo, 'findCollectionByReceiptNo')
        .mockResolvedValue(
          null as unknown as Awaited<ReturnType<typeof feeRepo.findCollectionByReceiptNo>>,
        );

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/slis/fees/collections',
          headers: { authorization: `Bearer ${kanoOfficerToken}` },
          payload: {
            schemeId: KANO_SCHEME_ID,
            seasonId: SEASON_ID,
            billingId,
            farmerId: KANO_FARMER_ID,
            amountNgn: '1000.00',
            paidOn: '2026-03-21',
            receiptNo,
          },
        });

        expect(res.statusCode).toBe(409);
        const body = JSON.parse(res.payload);
        expect(body.status).toBe(409);
        expect(body.detail || body.message).toContain('Duplicate receipt');
      } finally {
        spy.mockRestore();
      }
    });

    it('maps Postgres unique violation (23505) on fee_collection_device_receipt_unique to 409 Conflict', async () => {
      const testDeviceId = crypto.randomUUID();
      const testRef = `DEVICE-REF-${Date.now()}`;

      // Insert a device first
      await testDb.insert(device).values({
        id: testDeviceId,
        installationId: crypto.randomUUID(),
        userId: KANO_OFFICER_ID,
        label: 'Test Tab',
        platform: 'android',
      });

      // Insert first row with deviceId and fieldReceiptRef
      await testDb.insert(feeCollection).values({
        id: crypto.randomUUID(),
        schemeId: KANO_SCHEME_ID,
        seasonId: SEASON_ID,
        billingId,
        farmerId: KANO_FARMER_ID,
        amountNgn: '1000.00',
        paidOn: '2026-03-21',
        receiptNo: `REC-DEV1-${Date.now()}`,
        deviceId: testDeviceId,
        fieldReceiptRef: testRef,
        status: 'submitted',
        version: 1,
        createdBy: KANO_OFFICER_ID,
        updatedBy: KANO_OFFICER_ID,
      });

      // Create a second row with the same deviceId and fieldReceiptRef
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '1000.00',
          paidOn: '2026-03-21',
          deviceId: testDeviceId,
          fieldReceiptRef: testRef,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe(409);
      expect(body.detail || body.message).toContain('Duplicate receipt');
    });

    it('rejects collection exceeding remaining billed balance with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '50000.00', // exceeds remaining balance
          paidOn: '2026-03-22',
        },
      });

      expect(res.statusCode).toBe(400);
      const errBody = JSON.parse(res.payload);
      expect(errBody.detail || errBody.message).toContain('exceeds billed amount');
    });

    it('rejects collection outside user scope with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          schemeId: KADUNA_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KADUNA_FARMER_ID,
          amountNgn: '5000.00',
          paidOn: '2026-03-22',
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /slis/fees/collections and PATCH /slis/fees/collections/:id', () => {
    let collectionId: string;
    let billingId: string;

    beforeAll(async () => {
      const [b] = await testDb
        .insert(feeBilling)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          farmerId: KANO_FARMER_ID,
          amountNgn: '20000.00',
          dueDate: '2026-05-01',
          status: 'billed',
          version: 1,
          createdBy: KANO_OFFICER_ID,
          updatedBy: KANO_OFFICER_ID,
        })
        .returning();
      billingId = b.id;

      const [c] = await testDb
        .insert(feeCollection)
        .values({
          id: crypto.randomUUID(),
          schemeId: KANO_SCHEME_ID,
          seasonId: SEASON_ID,
          billingId,
          farmerId: KANO_FARMER_ID,
          amountNgn: '8000.00',
          paidOn: '2026-03-20',
          receiptNo: `REC-PATCH-${Date.now()}`,
          status: 'submitted',
          version: 1,
          createdBy: KANO_OFFICER_ID,
          updatedBy: KANO_OFFICER_ID,
        })
        .returning();
      collectionId = c.id;
    });

    it('lists fee collections scoped to user scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/fees/collections',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.schemeId).toBe(KANO_SCHEME_ID);
      }
    });

    it('retrieves an in-scope collection detail by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/fees/collections/${collectionId}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(collectionId);
      expect(body.amountNgn).toBe('8000.00');
    });

    it('returns 404 for an out-of-scope collection detail', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/fees/collections/${collectionId}`,
        headers: { authorization: `Bearer ${kadunaOfficerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('updates fee collection with valid If-Match', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/fees/collections/${collectionId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
        },
        payload: {
          fieldReceiptRef: 'OFFLINE-REF-99',
          status: 'submitted',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.fieldReceiptRef).toBe('OFFLINE-REF-99');
      expect(body.version).toBe(2);
    });

    it('returns 404 for an out-of-scope collection update', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/fees/collections/${collectionId}`,
        headers: {
          authorization: `Bearer ${kadunaOfficerToken}`,
          'if-match': '2',
        },
        payload: {
          fieldReceiptRef: 'ROGUE-REF',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
