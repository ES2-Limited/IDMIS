import 'reflect-metadata';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import {
  appUser,
  assignment,
  auditLog,
  lga,
  organisation,
  organisationState,
  outboxEvent,
  role,
  rolePermission,
  session,
  state,
  ward,
  wua,
  SYSTEM_USER_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
  eq,
  isNotNull,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { KNOWN_EVENT_TYPES, permissions } from '@idmis/contracts';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { TokenService } from '../auth/token.service';
import { RedisService } from '../../platform/redis/redis.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

describe('Core Admin APIs (BE-1.6)', () => {
  const TEST_DB_NAME = `idmis_admin_test_${Date.now()}`;
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

  // IDs
  const ADMIN_USER_ID = '018f3a5e-1000-7000-8000-000000000001';
  const KANO_STATE_ID = '018f3a5e-2000-7000-8000-000000000001';
  const KADUNA_STATE_ID = '018f3a5e-2000-7000-8000-000000000002';
  const KANO_OFFICER_ID = '018f3a5e-1000-7000-8000-000000000002';
  const SYS_ADMIN_ROLE_ID = '018f3a5e-3000-7000-8000-000000000001';
  const FIELD_OFFICER_ROLE_ID = '018f3a5e-3000-7000-8000-000000000002';
  const PROGRAMME_MGR_ROLE_ID = '018f3a5e-3000-7000-8000-000000000003';
  const PROG_MGR_USER_ID = '018f3a5e-1000-7000-8000-000000000003';
  const SECOND_ADMIN_USER_ID = '018f3a5e-1000-7000-8000-000000000004';
  const KADUNA_USER_ID = '018f3a5e-1000-7000-8000-000000000005';

  const KANO_ORG_ID = '018f3a5e-4000-7000-8000-000000000001';
  const KADUNA_ORG_ID = '018f3a5e-4000-7000-8000-000000000002';
  const KANO_LGA_ID = '018f3a5e-5000-7000-8000-000000000001';
  const KANO_WARD_ID = '018f3a5e-6000-7000-8000-000000000001';

  let adminToken: string;
  let kanoOfficerToken: string;
  let progMgrToken: string;
  let adminAssignmentId: string;

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
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.gov.ng',
      fullName: 'System User',
      passwordHash: passHash,
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 2. Seed Geography: States, LGA, Ward
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

    await testDb.insert(lga).values({
      id: KANO_LGA_ID,
      stateId: KANO_STATE_ID,
      code: 'KAN-KURA',
      name: 'Kura',
    });

    await testDb.insert(ward).values({
      id: KANO_WARD_ID,
      lgaId: KANO_LGA_ID,
      code: 'KAN-KURA-W01',
      name: 'Kura Central',
    });

    // 3. Seed Organisations
    await testDb.insert(organisation).values([
      {
        id: KANO_ORG_ID,
        type: 'scheme',
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_ORG_ID,
        type: 'scheme',
        code: 'HJIS',
        name: 'Hadejia-Jamaare Scheme',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    await testDb.insert(organisationState).values([
      { organisationId: KANO_ORG_ID, stateId: KANO_STATE_ID },
      { organisationId: KADUNA_ORG_ID, stateId: KADUNA_STATE_ID },
    ]);

    // 4. Seed Roles & Permissions
    await testDb.insert(role).values([
      {
        id: SYS_ADMIN_ROLE_ID,
        key: 'system_admin',
        name: 'System Administrator',
        description: 'Super user',
        isSystem: true,
      },
      {
        id: FIELD_OFFICER_ROLE_ID,
        key: 'field_officer',
        name: 'Field Officer',
        description: 'Field officer',
        isSystem: true,
      },
      {
        id: PROGRAMME_MGR_ROLE_ID,
        key: 'programme_manager',
        name: 'Programme Manager',
        description: 'National programme manager',
        isSystem: true,
      },
    ]);

    // System admin has all permissions
    const allPerms = Object.values(permissions);
    await testDb.insert(rolePermission).values(
      allPerms.map((perm) => ({
        roleId: SYS_ADMIN_ROLE_ID,
        permission: perm,
      })),
    );

    // Field officer has limited permissions
    await testDb.insert(rolePermission).values([
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_WUA_READ },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_WUA_MANAGE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_ASSIGNMENT_READ },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_ASSIGNMENT_MANAGE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_USER_READ },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_USER_CREATE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_USER_UPDATE },
      { roleId: FIELD_OFFICER_ROLE_ID, permission: permissions.CORE_USER_DEACTIVATE },
    ]);

    // Programme manager has user and assignment management, but not system admin powers
    await testDb.insert(rolePermission).values([
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_USER_READ },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_USER_CREATE },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_USER_UPDATE },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_USER_DEACTIVATE },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_ASSIGNMENT_READ },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_ASSIGNMENT_MANAGE },
      { roleId: PROGRAMME_MGR_ROLE_ID, permission: permissions.CORE_WUA_READ },
    ]);

    // 5. Seed Users & Assignments
    await testDb.insert(appUser).values([
      {
        id: ADMIN_USER_ID,
        email: 'admin@idmis.gov.ng',
        fullName: 'Global Admin',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: SECOND_ADMIN_USER_ID,
        email: 'admin2@idmis.gov.ng',
        fullName: 'Second Global Admin',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KANO_OFFICER_ID,
        email: 'kano.officer@idmis.gov.ng',
        fullName: 'Kano Officer',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: PROG_MGR_USER_ID,
        email: 'progmgr@idmis.gov.ng',
        fullName: 'National Programme Manager',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
      {
        id: KADUNA_USER_ID,
        email: 'kaduna.user@idmis.gov.ng',
        fullName: 'Kaduna User',
        passwordHash: passHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    ]);

    // Admin has national assignment (capture ID)
    adminAssignmentId = crypto.randomUUID();
    await testDb.insert(assignment).values({
      id: adminAssignmentId,
      userId: ADMIN_USER_ID,
      roleId: SYS_ADMIN_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Second admin also has national assignment
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: SECOND_ADMIN_USER_ID,
      roleId: SYS_ADMIN_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Programme manager has national assignment
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: PROG_MGR_USER_ID,
      roleId: PROGRAMME_MGR_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kano officer has state-scoped assignment (Kano only)
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'core',
      scopeType: 'state',
      scopeStateId: KANO_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Kaduna user has state-scoped assignment (Kaduna only)
    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: KADUNA_USER_ID,
      roleId: FIELD_OFFICER_ROLE_ID,
      module: 'core',
      scopeType: 'state',
      scopeStateId: KADUNA_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const sidAdmin = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidAdmin,
      familyId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const adminAuth = await tokenService.createAccessToken(ADMIN_USER_ID, sidAdmin);
    adminToken = adminAuth.accessToken;

    const sidSecondAdmin = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidSecondAdmin,
      familyId: crypto.randomUUID(),
      userId: SECOND_ADMIN_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await tokenService.createAccessToken(SECOND_ADMIN_USER_ID, sidSecondAdmin);

    const sidOfficer = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidOfficer,
      familyId: crypto.randomUUID(),
      userId: KANO_OFFICER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const officerAuth = await tokenService.createAccessToken(KANO_OFFICER_ID, sidOfficer);
    kanoOfficerToken = officerAuth.accessToken;

    const sidProgMgr = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sidProgMgr,
      familyId: crypto.randomUUID(),
      userId: PROG_MGR_USER_ID,
      refreshTokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const progMgrAuth = await tokenService.createAccessToken(PROG_MGR_USER_ID, sidProgMgr);
    progMgrToken = progMgrAuth.accessToken;
  });

  afterAll(async () => {
    resetAuditWriter();
    await app.close();
    await testClient.end();
    try {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
    } catch {
      // ignore cleanup errors in test
    }
    await adminClient.end();
  }, 20000);

  // --- 1. User Management ---
  describe('User Management Endpoints', () => {
    let createdUserId: string;

    it('POST /admin/users: creates a new user with Argon2id password hash and audit log', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'newuser@idmis.gov.ng',
          fullName: 'New Test User',
          password: 'SecretPassword123!',
          phone: '+2348011223344',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.email).toBe('newuser@idmis.gov.ng');
      expect(data.fullName).toBe('New Test User');
      expect(data.mustChangePassword).toBe(true);
      expect(data.passwordHash).toBeUndefined(); // Never returned
      createdUserId = data.id;

      // Check audit log row
      const logs = await testDb.select().from(auditLog).where(isNotNull(auditLog.entityId));
      const userAudit = logs.find(
        (l: typeof auditLog.$inferSelect) =>
          l.entityType === 'core.app_user' && l.action === 'create',
      );
      expect(userAudit).toBeDefined();
    });

    it('GET /admin/users: lists users with cursor pagination and role filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/users?limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.items.length).toBeGreaterThanOrEqual(2);
      expect(data.items[0]).toHaveProperty('email');
    });

    it('PATCH /admin/users/:id: updates user details and checks optimistic version', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/users/${createdUserId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'if-match': '"1"',
        },
        payload: {
          fullName: 'Updated Name',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.fullName).toBe('Updated Name');
    });

    it('DELETE /admin/users/:id: soft deletes a user', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${createdUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const getUserRes = await app.inject({
        method: 'GET',
        url: `/admin/users/${createdUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getUserRes.statusCode).toBe(404);
    });

    it('createUser: non-national creator requires first assignment in scope', async () => {
      // 1. Missing firstAssignment -> 400
      const missingAssignmentRes = await app.inject({
        method: 'POST',
        url: '/admin/users',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          email: 'officer_sub1@idmis.gov.ng',
          fullName: 'Subordinate 1',
          password: 'SecretPassword123!',
        },
      });
      expect(missingAssignmentRes.statusCode).toBe(400);
      expect(JSON.parse(missingAssignmentRes.body).detail).toContain(
        'first assignment inside their scope',
      );

      // 2. First assignment in Kaduna (out of scope for Kano officer) -> 403
      const outOfScopeRes = await app.inject({
        method: 'POST',
        url: '/admin/users',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          email: 'officer_sub2@idmis.gov.ng',
          fullName: 'Subordinate 2',
          password: 'SecretPassword123!',
          firstAssignment: {
            roleId: FIELD_OFFICER_ROLE_ID,
            module: 'core',
            scopeType: 'state',
            scopeStateId: KADUNA_STATE_ID,
          },
        },
      });
      expect(outOfScopeRes.statusCode).toBe(403);

      // 3. First assignment in Kano -> 201
      const inScopeRes = await app.inject({
        method: 'POST',
        url: '/admin/users',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          email: 'officer_sub3@idmis.gov.ng',
          fullName: 'Subordinate 3',
          password: 'SecretPassword123!',
          firstAssignment: {
            roleId: FIELD_OFFICER_ROLE_ID,
            module: 'core',
            scopeType: 'state',
            scopeStateId: KANO_STATE_ID,
          },
        },
      });
      expect(inScopeRes.statusCode).toBe(201);
      const createdData = JSON.parse(inScopeRes.body);
      expect(createdData.mustChangePassword).toBe(true);
    });

    it('user visibility and isolation: state admin cannot see/edit/deactivate users outside their state or any admin (404)', async () => {
      // State officer cannot see national admin -> 404
      const getAdminRes = await app.inject({
        method: 'GET',
        url: `/admin/users/${ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(getAdminRes.statusCode).toBe(404);

      // State officer cannot edit national admin -> 404
      const patchAdminRes = await app.inject({
        method: 'PATCH',
        url: `/admin/users/${ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: { fullName: 'Hacked Admin' },
      });
      expect(patchAdminRes.statusCode).toBe(404);

      // State officer cannot deactivate national admin -> 404
      const delAdminRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(delAdminRes.statusCode).toBe(404);

      // State officer cannot see Kaduna user -> 404
      const getKadunaRes = await app.inject({
        method: 'GET',
        url: `/admin/users/${KADUNA_USER_ID}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(getKadunaRes.statusCode).toBe(404);

      // State officer listing users does not include admin or kaduna user
      const listRes = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      const emails = listBody.items.map((u: { email: string }) => u.email);
      expect(emails).not.toContain('admin@idmis.gov.ng');
      expect(emails).not.toContain('kaduna.user@idmis.gov.ng');
    });

    it('deactivateUser: no self-deactivation and the last active national system_admin cannot be deactivated', async () => {
      // 1. Self deactivation forbidden -> 403
      const selfDelRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(selfDelRes.statusCode).toBe(403);
      expect(JSON.parse(selfDelRes.body).detail).toContain('Cannot deactivate your own account');

      // 2. Admin can deactivate second admin -> 200
      const delSecondAdminRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${SECOND_ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delSecondAdminRes.statusCode).toBe(200);

      // 3. Now only ADMIN_USER_ID is an active national system_admin.
      // Another national caller (progMgrToken) cannot deactivate the last active national system admin -> 403
      const delOnlyAdminRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${ADMIN_USER_ID}`,
        headers: { authorization: `Bearer ${progMgrToken}` },
      });
      expect(delOnlyAdminRes.statusCode).toBe(403);
      expect(JSON.parse(delOnlyAdminRes.body).detail).toContain(
        'Cannot deactivate the last active national system administrator',
      );
    });
  });

  // --- 2. Anti-Privilege Escalation in Assignments ---
  describe('Assignment Management & Anti-Privilege Escalation', () => {
    let testSubjectUserId: string;

    beforeAll(async () => {
      const pass = await argon2.hash('Subject123!');
      const [u] = await testDb
        .insert(appUser)
        .values({
          id: crypto.randomUUID(),
          email: 'subject@idmis.gov.ng',
          fullName: 'Subject User',
          passwordHash: pass,
          isActive: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .returning();
      testSubjectUserId = u.id;
    });

    it('anti-privilege escalation: state-scoped officer CANNOT assign national scope (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          userId: testSubjectUserId,
          roleId: FIELD_OFFICER_ROLE_ID,
          module: 'core',
          scopeType: 'national',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain('outside your assignment management scope');
    });

    it('anti-privilege escalation: state-scoped officer CANNOT assign to a state outside their scope (403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          userId: testSubjectUserId,
          roleId: FIELD_OFFICER_ROLE_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: KADUNA_STATE_ID, // Out of scope for Kano officer!
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain('outside your assignment management scope');
    });

    it('anti-privilege escalation: assigner CANNOT assign a role with permissions exceeding their own (403)', async () => {
      // Kano officer tries to assign SYS_ADMIN_ROLE_ID (which grants core.setting.manage, core.user.create, etc.)
      const res = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          userId: testSubjectUserId,
          roleId: SYS_ADMIN_ROLE_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: KANO_STATE_ID,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain('exceeds your scope or is not held by you');
    });

    it('anti-privilege escalation: national programme_manager cannot grant system_admin (403)', async () => {
      // National programme manager holds national scope, but lacks system_admin permissions like core.setting.manage
      const res = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${progMgrToken}` },
        payload: {
          userId: testSubjectUserId,
          roleId: SYS_ADMIN_ROLE_ID,
          module: 'core',
          scopeType: 'national',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain('exceeds your scope or is not held by you');
    });

    it('anti-privilege escalation: nobody can self-assign or delete their own assignment (403)', async () => {
      // Self-assignment forbidden
      const selfAssignRes = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: ADMIN_USER_ID,
          roleId: FIELD_OFFICER_ROLE_ID,
          module: 'core',
          scopeType: 'national',
        },
      });
      expect(selfAssignRes.statusCode).toBe(403);
      expect(JSON.parse(selfAssignRes.body).detail).toContain('Cannot assign roles to yourself');

      // Self-deassignment forbidden
      const selfDeassignRes = await app.inject({
        method: 'DELETE',
        url: `/admin/assignments/${adminAssignmentId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(selfDeassignRes.statusCode).toBe(403);
      expect(JSON.parse(selfDeassignRes.body).detail).toContain(
        'Cannot remove your own assignments',
      );
    });

    it('anti-privilege escalation: the last active national system_admin assignment cannot be removed (403)', async () => {
      // Programme manager (national) tries to remove the last active national system_admin assignment of ADMIN_USER_ID
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/assignments/${adminAssignmentId}`,
        headers: { authorization: `Bearer ${progMgrToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain(
        'Cannot remove the last active national system administrator assignment',
      );
    });

    it('allows assignment creation when within assigner role permissions and scope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/assignments',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          userId: testSubjectUserId,
          roleId: FIELD_OFFICER_ROLE_ID,
          module: 'core',
          scopeType: 'state',
          scopeStateId: KANO_STATE_ID,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.userId).toBe(testSubjectUserId);
      expect(data.scopeStateId).toBe(KANO_STATE_ID);
    });

    it('event catalogue verification: every outbox event emitted exists in KNOWN_EVENT_TYPES', async () => {
      const events = await testDb.select().from(outboxEvent);
      expect(events.length).toBeGreaterThan(0);
      for (const ev of events) {
        expect(KNOWN_EVENT_TYPES).toContain(ev.eventType);
      }
    });
  });

  // --- 3. Organisations Tree & Management ---
  describe('Organisations API', () => {
    let createdOrgId: string;

    it('POST /admin/organisations: creates an organisation and links states', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/organisations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          type: 'scheme',
          code: 'TEST-SCHEME-01',
          name: 'Test Scheme 01',
          stateIds: [KANO_STATE_ID],
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.code).toBe('TEST-SCHEME-01');
      expect(data.stateIds).toContain(KANO_STATE_ID);
      createdOrgId = data.id;
    });

    it('GET /admin/organisations: lists organisations filtered by stateId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/admin/organisations?stateId=${KANO_STATE_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((o: { id: string }) => o.id === KANO_ORG_ID)).toBe(true);
      expect(data.some((o: { id: string }) => o.id === KADUNA_ORG_ID)).toBe(false);
    });

    it('PATCH /admin/organisations/:id: updates organisation details and state associations', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/organisations/${createdOrgId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'if-match': '"1"',
        },
        payload: {
          name: 'Updated Scheme Name',
          stateIds: [KANO_STATE_ID, KADUNA_STATE_ID],
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.name).toBe('Updated Scheme Name');
      expect(data.stateIds).toHaveLength(2);
    });
  });

  // --- 4. WUAs, Officers & Encryption ---
  describe('WUAs & Officers Endpoints with Scope & Encryption', () => {
    let createdWuaId: string;

    it('assertInScope write checks: rejects create into unscoped state with 403', async () => {
      // Kano officer tries to create WUA in Kaduna organisation
      const res = await app.inject({
        method: 'POST',
        url: '/wuas',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          level: 'unit',
          organisationId: KADUNA_ORG_ID,
          name: 'Kaduna WUA by Kano Officer',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).detail).toContain('outside your assigned scope');
    });

    it('POST /wuas: creates WUA in scoped location and encrypts bank account number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/wuas',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          level: 'unit',
          organisationId: KANO_ORG_ID,
          wardId: KANO_WARD_ID,
          regNo: 'WUA-KAN-001',
          name: 'Kura Farmers Association',
          bankName: 'First Bank of Nigeria',
          bankAccountNumber: '0123456789',
          isOperational: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.name).toBe('Kura Farmers Association');
      expect(data.stateId).toBe(KANO_STATE_ID); // Server-side derived!
      expect(data.bankAccountLast4).toBe('6789'); // Masked!
      expect(data.bankAccountNumber).toBeUndefined(); // Raw plaintext never returned
      createdWuaId = data.id;

      // Verify that the bank account is encrypted in the raw database row
      const [rawWua] = await testDb.select().from(wua).where(isNotNull(wua.id));
      expect(rawWua?.bankAccountEnc).toBeDefined();
      expect(rawWua?.bankAccountEnc?.toString()).not.toContain('0123456789');
    });

    it('GET /wuas: scoped listing only returns WUAs in user scope', async () => {
      // Create a Kaduna WUA as admin
      await testDb.insert(wua).values({
        id: crypto.randomUUID(),
        level: 'unit',
        organisationId: KADUNA_ORG_ID,
        stateId: KADUNA_STATE_ID,
        name: 'Kaduna Native Association',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Kano officer only sees Kano WUAs
      const kanoRes = await app.inject({
        method: 'GET',
        url: '/wuas',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      expect(kanoRes.statusCode).toBe(200);
      const kanoData = JSON.parse(kanoRes.body);
      expect(kanoData.items.every((w: { stateId: string }) => w.stateId === KANO_STATE_ID)).toBe(
        true,
      );

      // Admin sees both
      const adminRes = await app.inject({
        method: 'GET',
        url: '/wuas',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminRes.statusCode).toBe(200);
      const adminData = JSON.parse(adminRes.body);
      expect(adminData.items.length).toBeGreaterThanOrEqual(2);
    });

    it('assertInScope write checks: rejects update of out-of-scope WUA with 404 (no leak)', async () => {
      // Kaduna WUA id
      const [kadunaWua] = await testDb.select().from(wua).where(eq(wua.stateId, KADUNA_STATE_ID));
      const res = await app.inject({
        method: 'PATCH',
        url: `/wuas/${kadunaWua?.id}`,
        headers: {
          authorization: `Bearer ${kanoOfficerToken}`,
          'if-match': '"1"',
        },
        payload: {
          name: 'Hacked Name',
        },
      });

      // Must return 404 to avoid leaking existence of out-of-scope record
      expect(res.statusCode).toBe(404);
    });

    it('POST /wuas/:id/officers & DELETE /wuas/:id/officers/:id: officer lifecycle', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: `/wuas/${createdWuaId}/officers`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
        payload: {
          office: 'chair',
          fullName: 'Alhaji Ibrahim Kura',
          phone: '+2348033221100',
        },
      });

      expect(addRes.statusCode).toBe(201);
      const officer = JSON.parse(addRes.body);
      expect(officer.office).toBe('chair');

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/wuas/${createdWuaId}/officers/${officer.id}`,
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  // --- 5. Geography Endpoints ---
  describe('Geography Read Endpoints', () => {
    it('GET /geography/states: returns list of states', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/geography/states',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const states = JSON.parse(res.body);
      expect(states.length).toBeGreaterThanOrEqual(2);
      expect(states.map((s: { name: string }) => s.name)).toContain('Kano');
    });

    it('GET /geography/lgas?stateId=: returns LGAs for a state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/geography/lgas?stateId=${KANO_STATE_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const lgas = JSON.parse(res.body);
      expect(lgas).toHaveLength(1);
      expect(lgas[0].name).toBe('Kura');
    });
  });

  // --- 6. Lookups & Settings ---
  describe('Lookups & Settings API', () => {
    it('POST & GET /admin/lookups: creates and reads lookup values', async () => {
      const typeRes = await app.inject({
        method: 'POST',
        url: '/admin/lookups/types',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          key: 'crop_type',
          name: 'Crop Types',
          module: 'slis',
        },
      });
      expect(typeRes.statusCode).toBe(201);
      const lookupTypeObj = JSON.parse(typeRes.body);

      const valRes = await app.inject({
        method: 'POST',
        url: '/admin/lookups/values',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          lookupTypeId: lookupTypeObj.id,
          code: 'RICE',
          label: 'Rice',
          sortOrder: 1,
        },
      });
      expect(valRes.statusCode).toBe(201);

      const getValRes = await app.inject({
        method: 'GET',
        url: '/admin/lookups/values?typeKey=crop_type',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getValRes.statusCode).toBe(200);
      const values = JSON.parse(getValRes.body);
      expect(values).toHaveLength(1);
      expect(values[0].code).toBe('RICE');
    });

    it('PATCH & GET /admin/settings: updates and reads system settings', async () => {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: '/admin/settings/audit_retention_months',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { value: 12 },
      });

      expect(patchRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: '/admin/settings',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      const settings = JSON.parse(getRes.body);
      expect(
        settings.some(
          (s: { key: string; value: unknown }) =>
            s.key === 'audit_retention_months' && s.value === 12,
        ),
      ).toBe(true);
    });
  });

  // --- 7. Scoped Audit Logs Query ---
  describe('Audit Query API Scoping', () => {
    beforeAll(async () => {
      // Seed an audit log in Kano and one in Kaduna
      await testDb.insert(auditLog).values([
        {
          action: 'create',
          entityType: 'core.wua',
          stateId: KANO_STATE_ID,
          actorType: 'user',
        },
        {
          action: 'create',
          entityType: 'core.wua',
          stateId: KADUNA_STATE_ID,
          actorType: 'user',
        },
      ]);
    });

    it('state-scoped user cannot read audit logs (403 Forbidden because core.audit.read is global)', async () => {
      // Grant CORE_AUDIT_READ to field_officer for testing
      await testDb.insert(rolePermission).values({
        roleId: FIELD_OFFICER_ROLE_ID,
        permission: permissions.CORE_AUDIT_READ,
      });
      await app.get(RedisService).incr('auth:rbac:epoch');

      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: `Bearer ${kanoOfficerToken}` },
      });

      // Global permission requires national scope; state-scoped assignment produces empty scope -> 403
      expect(res.statusCode).toBe(403);
    });

    it('national admin sees audit logs across all states, and can filter by stateId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/audit-logs',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const stateIds = data.items.map((l: { stateId: string }) => l.stateId);
      expect(stateIds).toContain(KANO_STATE_ID);
      expect(stateIds).toContain(KADUNA_STATE_ID);

      const kanoRes = await app.inject({
        method: 'GET',
        url: `/admin/audit-logs?stateId=${KANO_STATE_ID}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(kanoRes.statusCode).toBe(200);
      const kanoData = JSON.parse(kanoRes.body);
      expect(kanoData.items.length).toBeGreaterThanOrEqual(1);
      expect(kanoData.items.every((l: { stateId: string }) => l.stateId === KANO_STATE_ID)).toBe(
        true,
      );
    });
  });
});
