import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { seed } from '../seed';
import { setDatabaseUrl } from '../index';
import { appUser, assignment, auditLog } from '../schema';
import { SYSTEM_USER_ID, ROLE_SYSTEM_ADMIN_ID } from '../constants';
import { createAdmin, validatePasswordStrength } from '../create-admin';

describe('create-admin CLI (feat(db))', () => {
  const TEST_DB_NAME = `idmis_create_admin_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/idmis';
  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let sqlClient: postgres.Sql;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testDb: any;

  const TEST_ADMIN_EMAIL = 'admin_cli_test@idmis.gov.ng';
  const TEST_ADMIN_FULL_NAME = 'CLI Administrator Test';
  let initialPasswordHash: string;
  let newPasswordHash: string;

  beforeAll(async () => {
    initialPasswordHash = await argon2.hash('InitialSecurePass123!', { type: argon2.argon2id });
    newPasswordHash = await argon2.hash('UpdatedSecurePass123!', { type: argon2.argon2id });

    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    sqlClient = postgres(testDbUrl);
    testDb = drizzle(sqlClient);

    const migrationsFolder = path.resolve(__dirname, '../../migrations');
    await migrate(testDb, { migrationsFolder });

    setDatabaseUrl(testDbUrl);
    await seed();
  }, 30000);

  afterAll(async () => {
    delete process.env.CREATE_ADMIN_CONFIRM;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_FULL_NAME;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD;

    if (sqlClient) {
      await sqlClient.end({ timeout: 5 }).catch(() => {});
    }
    setDatabaseUrl(baseAdminUrl);
    if (adminClient) {
      await adminClient.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
      );
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end({ timeout: 5 }).catch(() => {});
    }
  });

  describe('Validation & Confirmation Guards', () => {
    it('refuses to run unless CREATE_ADMIN_CONFIRM=yes is set', async () => {
      delete process.env.CREATE_ADMIN_CONFIRM;

      await expect(
        createAdmin({
          confirm: 'no',
          email: TEST_ADMIN_EMAIL,
          fullName: TEST_ADMIN_FULL_NAME,
          passwordHash: initialPasswordHash,
        }),
      ).rejects.toThrow('Refusing to run unless CREATE_ADMIN_CONFIRM=yes is set.');
    });

    it('refuses plaintext password in environment variable', async () => {
      process.env.CREATE_ADMIN_CONFIRM = 'yes';
      process.env.ADMIN_PASSWORD = 'PlaintextPassword123!';

      try {
        await expect(
          createAdmin({
            confirm: 'yes',
            email: TEST_ADMIN_EMAIL,
            fullName: TEST_ADMIN_FULL_NAME,
            passwordHash: initialPasswordHash,
          }),
        ).rejects.toThrow(/Plaintext password detected in env variable/);
      } finally {
        delete process.env.ADMIN_PASSWORD;
      }
    });

    it('refuses ADMIN_PASSWORD_HASH that does not start with $argon2id$', async () => {
      await expect(
        createAdmin({
          confirm: 'yes',
          email: TEST_ADMIN_EMAIL,
          fullName: TEST_ADMIN_FULL_NAME,
          passwordHash: '$bcrypt$invalidhash...',
        }),
      ).rejects.toThrow(
        'ADMIN_PASSWORD_HASH must be a valid Argon2id hash starting with "$argon2id$".',
      );
    });

    it('enforces password strength rules (min length 10, not common)', () => {
      expect(() => validatePasswordStrength('short')).toThrow(
        'Password must be at least 10 characters long.',
      );
      expect(() => validatePasswordStrength('password123')).toThrow(
        'Password is too common or easily guessable.',
      );
      expect(() => validatePasswordStrength('ValidSecurePass123!')).not.toThrow();
    });
  });

  describe('User Creation & Idempotency', () => {
    let createdUserId: string;

    it('creates user + assignment + audit log in one transaction', async () => {
      process.env.CREATE_ADMIN_CONFIRM = 'yes';
      process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
      process.env.ADMIN_FULL_NAME = TEST_ADMIN_FULL_NAME;
      process.env.ADMIN_PASSWORD_HASH = initialPasswordHash;

      const result = await createAdmin({
        confirm: 'yes',
        email: TEST_ADMIN_EMAIL,
        fullName: TEST_ADMIN_FULL_NAME,
        passwordHash: initialPasswordHash,
      });

      expect(result.action).toBe('created');
      expect(result.userId).toBeDefined();
      createdUserId = result.userId;

      // 1. Verify app_user
      const [user] = await testDb.select().from(appUser).where(eq(appUser.id, createdUserId));

      expect(user).toBeDefined();
      expect(user.email).toBe(TEST_ADMIN_EMAIL.toLowerCase());
      expect(user.fullName).toBe(TEST_ADMIN_FULL_NAME);
      expect(user.isActive).toBe(true);
      expect(user.mustChangePassword).toBe(false);
      expect(user.passwordHash).toBe(initialPasswordHash);
      expect(user.failedSignIns).toBe(0);

      // 2. Verify assignment
      const [userAssignment] = await testDb
        .select()
        .from(assignment)
        .where(eq(assignment.userId, createdUserId));

      expect(userAssignment).toBeDefined();
      expect(userAssignment.roleId).toBe(ROLE_SYSTEM_ADMIN_ID);
      expect(userAssignment.module).toBe('core');
      expect(userAssignment.scopeType).toBe('national');
      expect(userAssignment.canCaptureOffline).toBe(true);

      // 3. Verify audit_log
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, createdUserId));

      const creationAudit = audits.find(
        (a: typeof auditLog.$inferSelect) => a.action === 'user.created',
      );
      expect(creationAudit).toBeDefined();
      expect(creationAudit?.actorType).toBe('system');
      expect(creationAudit?.actorUserId).toBe(SYSTEM_USER_ID);
      expect(creationAudit?.entityType).toBe('user');
      const changes = creationAudit?.changes as { after?: { note?: string } } | null;
      expect(changes?.after?.note).toBe('created via create-admin CLI');
    });

    it('refuses duplicate email without --reset-password', async () => {
      await expect(
        createAdmin({
          confirm: 'yes',
          email: TEST_ADMIN_EMAIL,
          fullName: TEST_ADMIN_FULL_NAME,
          passwordHash: initialPasswordHash,
          resetPassword: false,
        }),
      ).rejects.toThrow(
        `User with email "${TEST_ADMIN_EMAIL.toLowerCase()}" already exists. Use --reset-password to update their password.`,
      );
    });

    it('--reset-password updates only the password fields and audits user.password_reset', async () => {
      // Simulate failed attempts and lockout before reset
      await testDb
        .update(appUser)
        .set({
          failedSignIns: 4,
          lockedUntil: new Date(Date.now() + 60000).toISOString(),
        })
        .where(eq(appUser.id, createdUserId));

      const resetResult = await createAdmin({
        confirm: 'yes',
        email: TEST_ADMIN_EMAIL,
        fullName: 'Attempted Name Change (Should Be Ignored)',
        passwordHash: newPasswordHash,
        resetPassword: true,
      });

      expect(resetResult.action).toBe('reset');
      expect(resetResult.userId).toBe(createdUserId);

      // 1. Verify app_user fields
      const [updatedUser] = await testDb
        .select()
        .from(appUser)
        .where(eq(appUser.id, createdUserId));

      expect(updatedUser.passwordHash).toBe(newPasswordHash);
      expect(updatedUser.failedSignIns).toBe(0);
      expect(updatedUser.lockedUntil).toBeNull();
      // Ensure other fields remained unchanged
      expect(updatedUser.fullName).toBe(TEST_ADMIN_FULL_NAME);
      expect(updatedUser.email).toBe(TEST_ADMIN_EMAIL.toLowerCase());

      // 2. Verify audit_log for password reset
      const audits = await testDb
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, createdUserId));

      const resetAudit = audits.find(
        (a: typeof auditLog.$inferSelect) => a.action === 'user.password_reset',
      );
      expect(resetAudit).toBeDefined();
      expect(resetAudit?.actorType).toBe('system');
      expect(resetAudit?.actorUserId).toBe(SYSTEM_USER_ID);
      expect(resetAudit?.entityType).toBe('user');
      const changes = resetAudit?.changes as { after?: { note?: string } } | null;
      expect(changes?.after?.note).toBe('password reset via create-admin CLI');
    });

    it('--reset-password refuses if user does not exist', async () => {
      const nonExistentEmail = 'definitely_does_not_exist_999@idmis.gov.ng';
      await expect(
        createAdmin({
          confirm: 'yes',
          email: nonExistentEmail,
          fullName: 'Non Existent',
          passwordHash: newPasswordHash,
          resetPassword: true,
        }),
      ).rejects.toThrow(
        `Cannot reset password: user with email "${nonExistentEmail}" does not exist.`,
      );
    });
  });
});
