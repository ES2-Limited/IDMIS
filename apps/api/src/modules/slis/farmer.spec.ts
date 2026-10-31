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
  auditLog,
  lga,
  lookupType,
  lookupValue,
  organisation,
  organisationState,
  outboxEvent,
  role,
  rolePermission,
  session,
  state,
  ward,
  farmerIdentity,
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

describe('SLIS Farmers & Households (BE-2.2)', () => {
  const TEST_DB_NAME = `idmis_slis_farmer_test_${Date.now()}`;
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

  // UUIDs
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const KADUNA_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KADUNA_LGA_ID = '018f3a5e-5000-7000-8000-000000000002';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';
  const KADUNA_WARD_ID = '018f3a5e-6000-7000-8000-000000000002';

  const KANO_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KADUNA_SCHEME_ID = '018f3a5e-4000-7000-8000-000000000002';

  const NIN_DOC_TYPE_ID = '018f3a5e-7000-7000-8000-000000000001';
  const BANK_DOC_TYPE_ID = '018f3a5e-7000-7000-8000-000000000002';

  const ADMIN_USER_ID = '018f3a5e-1000-7000-8000-000000000001';
  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const KADUNA_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000003';
  const PRIVILEGED_VIEWER_ID = '018f3a5e-1000-7000-8000-000000000004';

  const FIELD_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000001';
  const PRIVILEGED_ROLE_ID = '018f3a5e-3000-7000-8000-000000000002';

  let kanoOfficerToken: string;
  let kadunaOfficerToken: string;
  let privilegedViewerToken: string;

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

    // 1. Seed System User
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
        id: KADUNA_OFFICER_ID,
        email: 'kaduna@idmis.gov.ng',
        fullName: 'Kaduna Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: PRIVILEGED_VIEWER_ID,
        email: 'privileged@idmis.gov.ng',
        fullName: 'Privileged Identity Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // 2. Geography
    await testDb.insert(state).values([
      {
        id: KANO_STATE_ID,
        code: 'KAN',
        name: 'Kano',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_STATE_ID,
        code: 'KAD',
        name: 'Kaduna',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(lga).values([
      { id: KANO_LGA_ID, stateId: KANO_STATE_ID, code: 'KAN-KURA', name: 'Kura' },
      { id: KADUNA_LGA_ID, stateId: KADUNA_STATE_ID, code: 'KAD-CHIK', name: 'Chikun' },
    ]);

    await testDb.insert(ward).values([
      { id: KANO_WARD_ID, lgaId: KANO_LGA_ID, code: 'KAN-W1', name: 'Kura Central' },
      { id: KADUNA_WARD_ID, lgaId: KADUNA_LGA_ID, code: 'KAD-W1', name: 'Chikun South' },
    ]);

    // 3. Organisations (Schemes)
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
        id: KADUNA_SCHEME_ID,
        type: 'scheme',
        code: 'HJIS',
        name: 'Hadejia-Jamaare Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_SCHEME_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_SCHEME_ID, stateId: KADUNA_STATE_ID },
    ]);

    // 4. Lookups for Identification Document Types
    const [docType] = await testDb
      .insert(lookupType)
      .values({
        id: crypto.randomUUID(),
        key: 'document_type',
        name: 'Identification Document Type',
        module: 'slis',
      })
      .returning();

    await testDb.insert(lookupValue).values([
      {
        id: NIN_DOC_TYPE_ID,
        lookupTypeId: docType!.id,
        code: 'nin',
        label: 'National Identity Number (NIN)',
        sortOrder: 1,
        metadata: { unique_per_person: true },
        isActive: true,
      },
      {
        id: BANK_DOC_TYPE_ID,
        lookupTypeId: docType!.id,
        code: 'bank_account',
        label: 'Bank Account Number',
        sortOrder: 2,
        metadata: { unique_per_person: false },
        isActive: true,
      },
    ]);

    // 5. Roles & Permissions
    await testDb.insert(role).values([
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: 'field_officer',
        name: 'Field Officer',
        description: 'Standard Field Officer',
        isSystem: true,
      },
      {
        id: PRIVILEGED_ROLE_ID,
        key: 'privileged_officer',
        name: 'Privileged Officer',
        description: 'Officer with identity viewing permissions',
        isSystem: false,
      },
    ]);

    // Field officer: read, create, update farmers + manage households
    await testDb.insert(rolePermission).values([
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.SLIS_HOUSEHOLD_MANAGE },
      // Privileged officer: all of above + slis.identity.view
      { roleId: PRIVILEGED_ROLE_ID, permission: permissions.SLIS_FARMER_READ },
      { roleId: PRIVILEGED_ROLE_ID, permission: permissions.SLIS_FARMER_CREATE },
      { roleId: PRIVILEGED_ROLE_ID, permission: permissions.SLIS_FARMER_UPDATE },
      { roleId: PRIVILEGED_ROLE_ID, permission: permissions.SLIS_HOUSEHOLD_MANAGE },
      { roleId: PRIVILEGED_ROLE_ID, permission: permissions.SLIS_IDENTITY_VIEW },
    ]);

    // 6. User Assignments
    // Kano officer: assigned to Kano Scheme
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: KANO_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kaduna officer: assigned to Kaduna Scheme
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KADUNA_OFFICER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: KADUNA_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Privileged viewer: assigned to Kano Scheme with identity view
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: PRIVILEGED_VIEWER_ID,
      roleId: PRIVILEGED_ROLE_ID,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: KANO_SCHEME_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Create session tokens
    const sidKano = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKano,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kanoOfficerToken = (await tokenService.createAccessToken(KANO_OFFICER_ID, sidKano)).accessToken;

    const sidKaduna = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidKaduna,
      familyId: crypto.randomUUID(),
      userId: KADUNA_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    kadunaOfficerToken = (await tokenService.createAccessToken(KADUNA_OFFICER_ID, sidKaduna))
      .accessToken;

    const sidPriv = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidPriv,
      familyId: crypto.randomUUID(),
      userId: PRIVILEGED_VIEWER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    privilegedViewerToken = (await tokenService.createAccessToken(PRIVILEGED_VIEWER_ID, sidPriv))
      .accessToken;
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

  describe('Farmer Creation & Location Scoping', () => {
    it('creates a farmer in-scope with server-side derived stateId, outbox event, and audit log', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KANO_WARD_ID,
          farmerCode: 'KRIS-FRM-001',
          firstName: 'Ibrahim',
          lastName: 'Musa',
          gender: 'male',
          birthYear: 1985,
          phone: '+2348011112222',
          village: 'Chiromawa',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.farmerCode).toBe('KRIS-FRM-001');
      expect(body.stateId).toBe(KANO_STATE_ID); // Derived server-side from Ward -> LGA -> State
      expect(body.status).toBe('draft');
      expect(body.version).toBe(1);

      // Verify audit log row created in transaction
      const auditRows = await testDb.select().from(auditLog).where(eq(auditLog.entityId, body.id));
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0]?.entityType).toBe('slis.farmer');
      expect(auditRows[0]?.action).toBe('create');
      expect(auditRows[0]?.actorUserId).toBe(KANO_OFFICER_ID);

      // Verify outbox event created
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, body.id));
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.eventType).toBe('slis.farmer.created');
    });

    it('rejects creating farmer in another scheme outside user scope (403 Forbidden)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`, // Scoped to Kano only
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KADUNA_SCHEME_ID, // Kaduna scheme
          wardId: KADUNA_WARD_ID,
          farmerCode: 'HJIS-FRM-001',
          firstName: 'Aliyu',
          lastName: 'Bello',
          gender: 'male',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('rejects creating farmer when ward state disagrees with scheme state (422 Unprocessable Entity)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KADUNA_WARD_ID, // Mismatched state (Kaduna ward with Kano scheme)
          farmerCode: 'KRIS-FRM-BAD',
          firstName: 'Sani',
          lastName: 'Garba',
          gender: 'male',
        },
      });

      expect(res.statusCode).toBe(422);
    });
  });

  describe('Farmer Identity Encryption & Masked vs Unmasked Viewing', () => {
    let farmerWithIdentityId: string;
    const testNin = '23456789012';

    it('creates farmer with inline identity document; raw number encrypted & hashed in DB', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KANO_WARD_ID,
          farmerCode: 'KRIS-FRM-002',
          firstName: 'Amina',
          lastName: 'Suleiman',
          gender: 'female',
          identities: [
            {
              documentTypeId: NIN_DOC_TYPE_ID,
              number: testNin,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      farmerWithIdentityId = body.id;

      // Creator without slis.identity.view sees only masked last4
      expect(body.identities).toHaveLength(1);
      expect(body.identities[0]?.numberLast4).toBe('9012');
      expect(body.identities[0]?.number).toBeUndefined();

      // Check raw database record
      const [dbId] = await testDb
        .select()
        .from(farmerIdentity)
        .where(eq(farmerIdentity.farmerId, farmerWithIdentityId));

      expect(dbId).toBeDefined();
      expect(dbId!.numberEnc).not.toBe(testNin);
      expect(dbId!.numberLast4).toBe('9012');
      expect(dbId!.numberHash).toMatch(/^1:[a-f0-9]{64}$/); // Versioned HMAC-SHA256
      expect(dbId!.uniquePerPerson).toBe(true); // Derived from document_type metadata
    });

    it('standard officer GET /slis/farmers/:id receives masked identity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/farmers/${farmerWithIdentityId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.identities[0]?.numberLast4).toBe('9012');
      expect(body.identities[0]?.number).toBeUndefined();
    });

    it('privileged officer with @Can(slis.identity.view) GET /slis/farmers/:id receives unmasked decrypted number', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/slis/farmers/${farmerWithIdentityId}`,
        headers: {
          authorization: `Bearer ${privilegedViewerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.identities[0]?.numberLast4).toBe('9012');
      expect(body.identities[0]?.number).toBe(testNin); // Decrypted via AES-256-GCM
    });

    it('supports identity sub-resource: add identity and delete identity', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: `/slis/farmers/${farmerWithIdentityId}/identities`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          documentTypeId: BANK_DOC_TYPE_ID,
          number: '0123456789',
          bankName: 'Access Bank',
        },
      });

      expect(addRes.statusCode).toBe(201);
      const addBody = addRes.json();
      expect(addBody.numberLast4).toBe('6789');
      expect(addBody.uniquePerPerson).toBe(false); // Bank account is not unique per person

      // Privileged get on identities sub-resource
      const listRes = await app.inject({
        method: 'GET',
        url: `/slis/farmers/${farmerWithIdentityId}/identities`,
        headers: {
          authorization: `Bearer ${privilegedViewerToken}`,
        },
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = listRes.json();
      expect(listBody).toHaveLength(2);
      expect(listBody[1].number).toBe('0123456789');

      // Delete secondary identity
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/slis/farmers/${farmerWithIdentityId}/identities/${addBody.id}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
        },
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('Privacy-Preserving Duplicate Detection', () => {
    let kadunaFarmerId: string;
    const duplicateNin = '99988877766';

    beforeAll(async () => {
      // Seed a farmer in Kaduna Scheme
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kadunaOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KADUNA_SCHEME_ID,
          wardId: KADUNA_WARD_ID,
          farmerCode: 'HJIS-FRM-099',
          firstName: 'Fatima',
          lastName: 'Yakubu',
          gender: 'female',
          phone: '+2348099990000',
          identities: [
            {
              documentTypeId: NIN_DOC_TYPE_ID,
              number: duplicateNin,
            },
          ],
        },
      });
      kadunaFarmerId = res.json().id;
      expect(kadunaFarmerId).toBeDefined();
    });

    it('returns full match for in-scope farmer without hiding details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers/check-duplicate',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          firstName: 'Ibrahim',
          lastName: 'Musa',
          phone: '+2348011112222',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.hasDuplicate).toBe(true);
      expect(body.inScopeMatches.length).toBeGreaterThanOrEqual(1);
      expect(body.inScopeMatches[0]?.firstName).toBe('Ibrahim');
      expect(body.outOfScopeMatchesCount).toBe(0);
    });

    it('strictly preserves privacy: out-of-scope match returns count ONLY without leaking name or scheme', async () => {
      // Kano officer searches with the NIN of Fatima Yakubu (who is in Kaduna scheme)
      const res = await app.inject({
        method: 'POST',
        url: '/slis/farmers/check-duplicate',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`, // Kano officer has NO scope for Kaduna
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          firstName: 'Random',
          lastName: 'Person',
          documentTypeId: NIN_DOC_TYPE_ID,
          identityNumber: duplicateNin,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.hasDuplicate).toBe(true);
      expect(body.inScopeMatches).toEqual([]); // Zero in-scope matches
      expect(body.outOfScopeMatchesCount).toBe(1); // Exactly 1 out-of-scope match

      // Verify that NO details from Kaduna farmer are present in the response
      const rawString = JSON.stringify(body);
      expect(rawString).not.toContain('Fatima');
      expect(rawString).not.toContain('Yakubu');
      expect(rawString).not.toContain('HJIS-FRM-099');
      expect(rawString).not.toContain(KADUNA_SCHEME_ID);
    });
  });

  describe('Optimistic Concurrency Control', () => {
    it('increments version on update and rejects stale version with 409 Conflict', async () => {
      // Create farmer
      const createRes = await app.inject({
        method: 'POST',
        url: '/slis/farmers',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KANO_WARD_ID,
          farmerCode: 'KRIS-FRM-CONCUR',
          firstName: 'Usman',
          lastName: 'Danfodio',
          gender: 'male',
        },
      });
      const farmerId = createRes.json().id;
      expect(createRes.json().version).toBe(1);

      // Valid update with If-Match: 1
      const update1 = await app.inject({
        method: 'PATCH',
        url: `/slis/farmers/${farmerId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          village: 'New Village',
        },
      });
      expect(update1.statusCode).toBe(200);
      expect(update1.json().version).toBe(2);

      // Stale update with If-Match: 1 should fail with 409 Conflict
      const staleUpdate = await app.inject({
        method: 'PATCH',
        url: `/slis/farmers/${farmerId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1', // Stale! Current version is 2
          'content-type': 'application/json',
        },
        payload: {
          village: 'Conflicting Village',
        },
      });
      expect(staleUpdate.statusCode).toBe(409);
      expect(staleUpdate.json().title).toContain('Conflict');
    });
  });

  describe('Households API', () => {
    let householdId: string;

    it('creates a household in scope with audit log and outbox event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/slis/households',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          schemeId: KANO_SCHEME_ID,
          wardId: KANO_WARD_ID,
          name: 'Musa Household',
          settlement: 'Unguwar Gabas',
          size: 8,
          males: 4,
          females: 4,
          children: 3,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.size).toBe(8);
      expect(body.version).toBe(1);
      householdId = body.id;

      // Verify outbox
      const events = await testDb
        .select()
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, householdId));
      expect(events[0]?.eventType).toBe('slis.household.created');
    });

    it('lists households within user scope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/slis/households',
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0]?.id).toBe(householdId);
    });

    it('enforces optimistic locking on household update', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/slis/households/${householdId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          size: 9,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().size).toBe(9);
      expect(res.json().version).toBe(2);

      // Stale update
      const staleRes = await app.inject({
        method: 'PATCH',
        url: `/slis/households/${householdId}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '1',
          'content-type': 'application/json',
        },
        payload: {
          size: 10,
        },
      });

      expect(staleRes.statusCode).toBe(409);
    });
  });
});
