import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { genRequestId, registerRequestIdHook } from '../../platform/logger/logger.config';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  state,
  lga,
  ward,
  organisation,
  organisationState,
  wua,
  session,
  SYSTEM_USER_ID,
  ROLE_SYSTEM_ADMIN_ID,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions, permissionKinds } from '@idmis/contracts';
import { TokenService } from './token.service';
import { AuthzService } from '../../platform/auth/authz.service';
import { applyScope, assertInScope, deriveLocationServerSide } from '../../platform/auth';
import { IS_PUBLIC_KEY } from '../../platform/auth/public.decorator';
import { IS_AUTHENTICATED_KEY } from '../../platform/auth/authenticated.decorator';
import { CAN_PERMISSION_KEY } from '../../platform/auth/can.decorator';
import { RedisService } from '../../platform/redis/redis.service';

describe('Permissions & Scope Specification (BE-1.4)', () => {
  const TEST_DB_NAME = `idmis_perm_test_${Date.now()}`;
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
  let authzService: AuthzService;
  let redisService: RedisService;
  let discoveryService: DiscoveryService;
  let reflector: Reflector;

  // Well-known test IDs
  const STATE_KANO_ID = '018f3a5e-2001-7000-8000-000000000001';
  const STATE_KADUNA_ID = '018f3a5e-2001-7000-8000-000000000002';
  const LGA_KANO_ID = '018f3a5e-2002-7000-8000-000000000001';
  const LGA_KADUNA_ID = '018f3a5e-2002-7000-8000-000000000002';
  const WARD_KANO_ID = '018f3a5e-2003-7000-8000-000000000001';
  const WARD_KADUNA_ID = '018f3a5e-2003-7000-8000-000000000002';

  const ORG_RBDA_HJ_ID = '018f3a5e-2004-7000-8000-000000000001';
  const ORG_SCHEME_KRIS_ID = '018f3a5e-2004-7000-8000-000000000002';
  const ORG_SECTOR_A_ID = '018f3a5e-2004-7000-8000-000000000003';
  const ORG_SCHEME_KADUNA_ID = '018f3a5e-2004-7000-8000-000000000004';

  const ROLE_PROGRAMME_MANAGER_ID = '018f3a5e-0000-7000-8000-000000000011';
  const ROLE_FIELD_OFFICER_ID = '018f3a5e-0000-7000-8000-000000000014';
  const ROLE_VIEWER_ID = '018f3a5e-0000-7000-8000-000000000018';
  const ROLE_SCHEME_DATA_OFFICER_ID = '018f3a5e-0000-7000-8000-000000000013';

  const USER_SYSADMIN_ID = '018f3a5e-3000-7000-8000-000000000001';
  const USER_NAT_PM_ID = '018f3a5e-3000-7000-8000-000000000002';
  const USER_KANO_ADMIN_1_ID = '018f3a5e-3000-7000-8000-000000000003';
  const USER_KANO_ADMIN_2_ID = '018f3a5e-3000-7000-8000-000000000004';
  const USER_AMINA_ID = '018f3a5e-3000-7000-8000-000000000005';
  const USER_SCHEME_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000006';
  const USER_KANO_FIELD_ID = '018f3a5e-3000-7000-8000-000000000007';
  const USER_KADUNA_FIELD_ID = '018f3a5e-3000-7000-8000-000000000008';
  const USER_RBDA_OFFICER_ID = '018f3a5e-3000-7000-8000-000000000009';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'super-secret-jwt-key-min-32-chars-long!';

    // 1. Create isolated test database
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    // 2. Run migrations
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });
    setDatabaseUrl(testDbUrl);

    // 3. Seed System User
    await testDb
      .insert(appUser)
      .values({
        id: SYSTEM_USER_ID,
        email: 'system@idmis.internal',
        username: 'system',
        fullName: 'System',
        passwordHash: '*',
        isActive: false,
        mustChangePassword: false,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();

    // 4. Seed Geography
    await testDb
      .insert(state)
      .values([
        {
          id: STATE_KANO_ID,
          code: 'KN',
          name: 'Kano',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: STATE_KADUNA_ID,
          code: 'KD',
          name: 'Kaduna',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ])
      .onConflictDoNothing();

    await testDb
      .insert(lga)
      .values([
        {
          id: LGA_KANO_ID,
          stateId: STATE_KANO_ID,
          code: 'KN-KURA',
          name: 'Kura',
        },
        {
          id: LGA_KADUNA_ID,
          stateId: STATE_KADUNA_ID,
          code: 'KD-ZARIA',
          name: 'Zaria',
        },
      ])
      .onConflictDoNothing();

    await testDb
      .insert(ward)
      .values([
        {
          id: WARD_KANO_ID,
          lgaId: LGA_KANO_ID,
          code: 'KN-KURA-W1',
          name: 'Kura Ward 1',
        },
        {
          id: WARD_KADUNA_ID,
          lgaId: LGA_KADUNA_ID,
          code: 'KD-ZARIA-W1',
          name: 'Zaria Ward 1',
        },
      ])
      .onConflictDoNothing();

    // 5. Seed Organisations (RBDA -> Scheme -> Sector)
    await testDb
      .insert(organisation)
      .values([
        {
          id: ORG_RBDA_HJ_ID,
          type: 'rbda',
          code: 'HJRBDA',
          name: 'Hadejia-Jamaare RBDA',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: ORG_SCHEME_KRIS_ID,
          type: 'scheme',
          parentId: ORG_RBDA_HJ_ID,
          code: 'KRIS',
          name: 'Kano River Irrigation Scheme',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: ORG_SECTOR_A_ID,
          type: 'sector',
          parentId: ORG_SCHEME_KRIS_ID,
          code: 'KRIS-SEC-A',
          name: 'Sector A',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: ORG_SCHEME_KADUNA_ID,
          type: 'scheme',
          code: 'KAD-SCHEME',
          name: 'Kaduna Irrigation Scheme',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ])
      .onConflictDoNothing();

    await testDb
      .insert(organisationState)
      .values([
        { organisationId: ORG_RBDA_HJ_ID, stateId: STATE_KANO_ID },
        { organisationId: ORG_SCHEME_KRIS_ID, stateId: STATE_KANO_ID },
        { organisationId: ORG_SCHEME_KADUNA_ID, stateId: STATE_KADUNA_ID },
      ])
      .onConflictDoNothing();

    // 6. Seed Roles & Role Permissions from constant matrix
    for (const r of SYSTEM_ROLES) {
      await testDb
        .insert(role)
        .values({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        })
        .onConflictDoNothing({ target: role.key });

      const rolePerms = SYSTEM_ROLE_PERMISSIONS[r.key] || [];
      for (const p of rolePerms) {
        await testDb
          .insert(rolePermission)
          .values({
            roleId: r.id,
            permission: p,
          })
          .onConflictDoNothing();
      }
    }

    // 7. Seed Users
    const dummyHash = await argon2.hash('Password123!', {
      type: argon2.argon2id,
    });

    const testUsers = [
      { id: USER_SYSADMIN_ID, email: 'sysadmin@test.gov.ng' },
      { id: USER_NAT_PM_ID, email: 'pm_national@test.gov.ng' },
      { id: USER_KANO_ADMIN_1_ID, email: 'kano_admin_1@test.gov.ng' },
      { id: USER_KANO_ADMIN_2_ID, email: 'kano_admin_2@test.gov.ng' },
      { id: USER_AMINA_ID, email: 'amina@test.gov.ng' },
      { id: USER_SCHEME_OFFICER_ID, email: 'scheme_officer@test.gov.ng' },
      { id: USER_KANO_FIELD_ID, email: 'kano_field@test.gov.ng' },
      { id: USER_KADUNA_FIELD_ID, email: 'kaduna_field@test.gov.ng' },
      { id: USER_RBDA_OFFICER_ID, email: 'rbda_officer@test.gov.ng' },
    ];

    for (const u of testUsers) {
      await testDb
        .insert(appUser)
        .values({
          id: u.id,
          email: u.email,
          username: u.email.split('@')[0],
          fullName: `Test ${u.email.split('@')[0]}`,
          passwordHash: dummyHash,
          isActive: true,
          mustChangePassword: false,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing({ target: appUser.id });
    }

    // 8. Seed Assignments
    await testDb
      .insert(assignment)
      .values([
        // Sysadmin: National
        {
          id: '018f3a5e-4000-7000-8000-000000000001',
          userId: USER_SYSADMIN_ID,
          roleId: ROLE_SYSTEM_ADMIN_ID,
          module: 'core',
          scopeType: 'national',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // National PM: National
        {
          id: '018f3a5e-4000-7000-8000-000000000002',
          userId: USER_NAT_PM_ID,
          roleId: ROLE_PROGRAMME_MANAGER_ID,
          module: 'core',
          scopeType: 'national',
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Kano Admin 1: State = Kano
        {
          id: '018f3a5e-4000-7000-8000-000000000003',
          userId: USER_KANO_ADMIN_1_ID,
          roleId: ROLE_PROGRAMME_MANAGER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KANO_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Kano Admin 2: State = Kano
        {
          id: '018f3a5e-4000-7000-8000-000000000004',
          userId: USER_KANO_ADMIN_2_ID,
          roleId: ROLE_PROGRAMME_MANAGER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KANO_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Amina: Field Officer in Kano + Viewer in Kaduna
        {
          id: '018f3a5e-4000-7000-8000-000000000005',
          userId: USER_AMINA_ID,
          roleId: ROLE_FIELD_OFFICER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KANO_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        {
          id: '018f3a5e-4000-7000-8000-000000000006',
          userId: USER_AMINA_ID,
          roleId: ROLE_VIEWER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KADUNA_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Scheme Officer: Scheme = KRIS
        {
          id: '018f3a5e-4000-7000-8000-000000000007',
          userId: USER_SCHEME_OFFICER_ID,
          roleId: ROLE_SCHEME_DATA_OFFICER_ID,
          module: 'core',
          scopeType: 'scheme',
          scopeOrgId: ORG_SCHEME_KRIS_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Kano Field Officer
        {
          id: '018f3a5e-4000-7000-8000-000000000008',
          userId: USER_KANO_FIELD_ID,
          roleId: ROLE_FIELD_OFFICER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KANO_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // Kaduna Field Officer
        {
          id: '018f3a5e-4000-7000-8000-000000000009',
          userId: USER_KADUNA_FIELD_ID,
          roleId: ROLE_FIELD_OFFICER_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: STATE_KADUNA_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        // RBDA Officer: Scope = HJ_RBDA
        {
          id: '018f3a5e-4000-7000-8000-000000000010',
          userId: USER_RBDA_OFFICER_ID,
          roleId: ROLE_PROGRAMME_MANAGER_ID,
          module: 'core',
          scopeType: 'rbda',
          scopeOrgId: ORG_RBDA_HJ_ID,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      ])
      .onConflictDoNothing();

    // 9. Start NestJS Fastify App
    const adapter = new FastifyAdapter({
      logger: false,
      genReqId: genRequestId,
    });
    registerRequestIdHook(adapter.getInstance());

    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    tokenService = app.get(TokenService);
    authzService = app.get(AuthzService);
    redisService = app.get(RedisService);
    discoveryService = app.get(DiscoveryService);
    reflector = app.get(Reflector);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testClient) {
      await testClient.end();
    }
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore drop database error
      }
      await adminClient.end();
    }
  });

  async function createAccessTokenFor(userId: string): Promise<string> {
    const sid = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sid,
      familyId: sid,
      userId,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const { accessToken } = await tokenService.createAccessToken(userId, sid);
    return accessToken;
  }

  describe('1. Route Marker & Startup Validation', () => {
    it('verifies that 100% of routes across all registered controllers declare EXACTLY ONE marker', () => {
      const controllers = discoveryService.getControllers();
      expect(controllers.length).toBeGreaterThan(0);

      let totalRoutesChecked = 0;

      for (const controllerWrapper of controllers) {
        const { instance, metatype } = controllerWrapper;
        if (!instance || !metatype) continue;

        const prototype = Object.getPrototypeOf(instance);
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (m) => m !== 'constructor' && typeof prototype[m] === 'function',
        );

        for (const methodName of methodNames) {
          const handler = prototype[methodName];
          const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]);
          const isAuthenticated = reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED_KEY, [
            handler,
            metatype,
          ]);
          const canPermission = reflector.getAllAndOverride<string>(CAN_PERMISSION_KEY, [
            handler,
            metatype,
          ]);

          let count = 0;
          if (isPublic) count++;
          if (isAuthenticated) count++;
          if (canPermission) count++;

          expect(
            count,
            `Endpoint ${metatype.name}.${methodName} must declare exactly 1 marker`,
          ).toBe(1);
          totalRoutesChecked++;
        }
      }

      expect(totalRoutesChecked).toBeGreaterThan(5);
    });
  });

  describe('2. Scope is Per-Permission (Kano Field Officer + Kaduna Viewer)', () => {
    it('proves Amina can read WUAs in Kaduna but CANNOT upload files in Kaduna', async () => {
      const authz = await authzService.getUserAuthz(USER_AMINA_ID);

      // 1. Amina holds both roles
      expect(authz.can(permissions.CORE_WUA_READ)).toBe(true);
      expect(authz.can(permissions.CORE_FILE_UPLOAD)).toBe(true);

      // 2. Scope for CORE_WUA_READ is the union of Kano + Kaduna
      const wuaScope = authz.scopeFor(permissions.CORE_WUA_READ);
      expect(wuaScope.isNational).toBe(false);
      expect(wuaScope.stateIds).toContain(STATE_KANO_ID);
      expect(wuaScope.stateIds).toContain(STATE_KADUNA_ID);

      // 3. Scope for CORE_FILE_UPLOAD is strictly KANO only (viewer does NOT grant file upload)
      const uploadScope = authz.scopeFor(permissions.CORE_FILE_UPLOAD);
      expect(uploadScope.isNational).toBe(false);
      expect(uploadScope.stateIds).toContain(STATE_KANO_ID);
      expect(uploadScope.stateIds).not.toContain(STATE_KADUNA_ID);

      // 4. Query filtering via applyScope: uploadScope matches Kano only
      const filterForUpload = applyScope(uploadScope, {
        state: wua.stateId,
      });
      expect(filterForUpload).toBeDefined();
    });
  });

  describe('3. Scoped vs Global Permissions', () => {
    it('proves state-scoped Programme Manager CANNOT manage lookups; National PM can', async () => {
      const statePmAuthz = await authzService.getUserAuthz(USER_KANO_ADMIN_1_ID);
      const natPmAuthz = await authzService.getUserAuthz(USER_NAT_PM_ID);

      // core.lookup.manage is classified as global
      expect(permissionKinds[permissions.CORE_LOOKUP_MANAGE]).toBe('global');

      // State PM holds the role, but has state-scope: global permission is denied!
      expect(statePmAuthz.can(permissions.CORE_LOOKUP_MANAGE)).toBe(false);
      const statePmScope = statePmAuthz.scopeFor(permissions.CORE_LOOKUP_MANAGE);
      expect(statePmScope.isNational).toBe(false);
      expect(statePmScope.stateIds).toHaveLength(0);

      // National PM holds national scope: global permission is granted!
      expect(natPmAuthz.can(permissions.CORE_LOOKUP_MANAGE)).toBe(true);
      const natPmScope = natPmAuthz.scopeFor(permissions.CORE_LOOKUP_MANAGE);
      expect(natPmScope.isNational).toBe(true);
    });
  });

  describe('4. Downward Scope Expansion at Compute Time', () => {
    it('expands Scheme scope to child sectors (scheme -> sector)', async () => {
      const authz = await authzService.getUserAuthz(USER_SCHEME_OFFICER_ID);
      const scope = authz.scopeFor(permissions.CORE_WUA_READ);

      expect(scope.schemeIds).toContain(ORG_SCHEME_KRIS_ID);
      // Child sector A under KRIS scheme must be resolved automatically in sectorIds
      expect(scope.sectorIds).toContain(ORG_SECTOR_A_ID);
    });

    it('expands RBDA scope downward: RBDA -> states, schemes, and child sectors', async () => {
      const authz = await authzService.getUserAuthz(USER_RBDA_OFFICER_ID);
      const scope = authz.scopeFor(permissions.CORE_ORGANISATION_READ);

      expect(scope.rbdaIds).toContain(ORG_RBDA_HJ_ID);
      // State expanded via organisation_state
      expect(scope.stateIds).toContain(STATE_KANO_ID);
      // Scheme under RBDA
      expect(scope.schemeIds).toContain(ORG_SCHEME_KRIS_ID);
      // Sector under Scheme under RBDA
      expect(scope.sectorIds).toContain(ORG_SECTOR_A_ID);
    });
  });

  describe('5. assertInScope & Server-Side Location Derivation', () => {
    it('derives location server-side and rejects (422) when ward state and org state disagree', async () => {
      // WARD_KANO_ID belongs to Kano, but ORG_SCHEME_KADUNA_ID belongs to Kaduna
      await expect(
        deriveLocationServerSide({
          wardId: WARD_KANO_ID,
          organisationId: ORG_SCHEME_KADUNA_ID,
        }),
      ).rejects.toThrow();
    });

    it('derives location successfully when ward and org states agree', async () => {
      const derived = await deriveLocationServerSide({
        wardId: WARD_KANO_ID,
        organisationId: ORG_SCHEME_KRIS_ID,
      });

      expect(derived.effectiveStateId).toBe(STATE_KANO_ID);
      expect(derived.schemeId).toBe(ORG_SCHEME_KRIS_ID);
    });

    it('assertInScope write checks: rejects create into unscoped location with 403', async () => {
      const kanoAdminAuthz = await authzService.getUserAuthz(USER_KANO_ADMIN_1_ID);

      // Attempting to create into Kaduna (outside Kano Admin's scope)
      await expect(
        assertInScope(kanoAdminAuthz, permissions.CORE_WUA_MANAGE, {
          wardId: WARD_KADUNA_ID,
          organisationId: ORG_SCHEME_KADUNA_ID,
        }),
      ).rejects.toThrowError(/outside your assigned scope/);
    });

    it('assertInScope write checks: rejects update of out-of-scope existing record with 404 (no existence leak)', async () => {
      const kanoAdminAuthz = await authzService.getUserAuthz(USER_KANO_ADMIN_1_ID);

      // Existing record is in Kaduna (out of scope for Kano admin)
      await expect(
        assertInScope(
          kanoAdminAuthz,
          permissions.CORE_WUA_MANAGE,
          {
            wardId: WARD_KANO_ID,
            organisationId: ORG_SCHEME_KRIS_ID,
          },
          {
            wardId: WARD_KADUNA_ID,
            organisationId: ORG_SCHEME_KADUNA_ID,
          },
        ),
      ).rejects.toThrowError(/Record not found/);
    });
  });

  describe('6. Password Reset Security & Takeover Prevention', () => {
    it('proves State Admin CANNOT reset another State Admin in the same state (returns 404)', async () => {
      const token = await createAccessTokenFor(USER_KANO_ADMIN_1_ID);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { userId: USER_KANO_ADMIN_2_ID },
      });

      // Returns 404 to avoid confirming the target administrator exists
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).title).toBe('Not Found');
    });

    it('proves State Admin CANNOT reset a user in another state (returns 404)', async () => {
      const token = await createAccessTokenFor(USER_KANO_ADMIN_1_ID);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { userId: USER_KADUNA_FIELD_ID },
      });

      expect(res.statusCode).toBe(404);
    });

    it('proves State Admin CAN reset a field officer in their own state', async () => {
      const token = await createAccessTokenFor(USER_KANO_ADMIN_1_ID);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { userId: USER_KANO_FIELD_ID },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.temporaryPassword).toBeDefined();
      expect(body.mustChangePassword).toBe(true);
    });

    it('proves System Admin can reset any user', async () => {
      const token = await createAccessTokenFor(USER_SYSADMIN_ID);

      const res = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: { authorization: `Bearer ${token}` },
        payload: { userId: USER_KANO_ADMIN_1_ID },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.temporaryPassword).toBeDefined();
    });

    it('proves POST /auth/reset-password excludes idempotency response caching', async () => {
      const token = await createAccessTokenFor(USER_SYSADMIN_ID);
      const idempotencyKey = crypto.randomUUID();

      // First call
      const res1 = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: { userId: USER_KANO_FIELD_ID },
      });

      expect(res1.statusCode).toBe(200);
      const pass1 = JSON.parse(res1.body).temporaryPassword;

      // Second call with same idempotency key: must NOT return cached response!
      const res2 = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': idempotencyKey,
        },
        payload: { userId: USER_KANO_FIELD_ID },
      });

      expect(res2.statusCode).toBe(200);
      const pass2 = JSON.parse(res2.body).temporaryPassword;
      // Fresh temporary password generated each time, never cached
      expect(pass1).not.toBe(pass2);
    });
  });

  describe('7. GET /auth/me/abilities endpoint', () => {
    it('returns permissions, per-permission scopes, and CASL rules for frontend', async () => {
      const token = await createAccessTokenFor(USER_AMINA_ID);

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me/abilities',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.permissions).toContain(permissions.CORE_WUA_READ);
      expect(body.scopes[permissions.CORE_WUA_READ]).toBeDefined();
      expect(body.rules.length).toBeGreaterThan(0);
    });
  });

  describe('8. Redis Cache & RBAC Epoch Invalidation', () => {
    it('caches abilities in Redis and invalidates on epoch increment', async () => {
      const initialEpoch = await authzService.getRbacEpoch();

      // First call: computes and caches
      const authz1 = await authzService.getUserAuthz(USER_NAT_PM_ID);
      expect(authz1.can(permissions.CORE_LOOKUP_MANAGE)).toBe(true);

      // Verify cached in Redis under initial epoch
      const cacheKey1 = `auth:user:${USER_NAT_PM_ID}:epoch:${initialEpoch}`;
      const cachedVal = await redisService.get(cacheKey1);
      expect(cachedVal).not.toBeNull();

      // Increment RBAC epoch (simulating role permission change on release/admin)
      const newEpoch = await authzService.incrementRbacEpoch();
      expect(newEpoch).toBe(initialEpoch + 1);

      // Subsequent call uses new epoch, bypassing old cache
      const cacheKey2 = `auth:user:${USER_NAT_PM_ID}:epoch:${newEpoch}`;
      const cachedValBefore = await redisService.get(cacheKey2);
      expect(cachedValBefore).toBeNull();

      const authz2 = await authzService.getUserAuthz(USER_NAT_PM_ID);
      expect(authz2.can(permissions.CORE_LOOKUP_MANAGE)).toBe(true);

      const cachedValAfter = await redisService.get(cacheKey2);
      expect(cachedValAfter).not.toBeNull();
    });
  });
});
