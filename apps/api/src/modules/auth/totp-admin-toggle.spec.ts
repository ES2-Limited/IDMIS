import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { AuthService } from './services/auth.service';
import {
  appUser,
  role,
  assignment,
  rolePermission,
  SYSTEM_USER_ID,
  ROLE_SYSTEM_ADMIN_ID,
  SYSTEM_ROLE_PERMISSIONS,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';

describe('Admin TOTP Toggle (AUTH_TOTP_ENFORCE_ADMINS)', () => {
  const TEST_DB_NAME = `idmis_totp_toggle_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;
  let app: NestFastifyApplication;
  let authService: AuthService;

  const ADMIN_NO_TOTP_ID = '018f3a5e-9999-7000-8000-000000000001';
  const ADMIN_NO_TOTP_EMAIL = 'admin_nototp@idmis.gov.ng';
  const ADMIN_PASSWORD = 'AdminSecurePass123!';

  const ADMIN_ENROLLED_ID = '018f3a5e-9999-7000-8000-000000000002';
  const ADMIN_ENROLLED_EMAIL = 'admin_enrolled@idmis.gov.ng';

  const REGULAR_NO_TOTP_ID = '018f3a5e-9999-7000-8000-000000000003';
  const REGULAR_NO_TOTP_EMAIL = 'user_nototp@idmis.gov.ng';
  const REGULAR_PASSWORD = 'UserSecurePass123!';

  const REGULAR_ENROLLED_ID = '018f3a5e-9999-7000-8000-000000000004';
  const REGULAR_ENROLLED_EMAIL = 'user_enrolled@idmis.gov.ng';

  const ROLE_REGULAR_ID = '018f3a5e-9999-7000-8000-000000000005';

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
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system_toggle@idmis.internal',
      username: 'system_toggle',
      fullName: 'System User',
      passwordHash: '*',
      isActive: false,
      mustChangePassword: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 4. Seed system_admin and regular roles
    await testDb
      .insert(role)
      .values({
        id: ROLE_SYSTEM_ADMIN_ID,
        key: 'system_admin',
        name: 'System Administrator',
        isSystem: true,
      })
      .onConflictDoNothing();

    await testDb
      .insert(role)
      .values({
        id: ROLE_REGULAR_ID,
        key: 'field_officer',
        name: 'Field Officer',
        isSystem: true,
      })
      .onConflictDoNothing();

    for (const perm of SYSTEM_ROLE_PERMISSIONS.system_admin) {
      await testDb
        .insert(rolePermission)
        .values({
          roleId: ROLE_SYSTEM_ADMIN_ID,
          permission: perm,
        })
        .onConflictDoNothing();
    }

    const adminHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    const regularHash = await argon2.hash(REGULAR_PASSWORD, { type: argon2.argon2id });
    const dummySecretEnc = Buffer.from('DUMMYTOTPSECRETKEY1234567890');

    // Admin WITHOUT TOTP (totpConfirmedAt: null)
    await testDb.insert(appUser).values({
      id: ADMIN_NO_TOTP_ID,
      email: ADMIN_NO_TOTP_EMAIL,
      username: 'admin_no_totp',
      fullName: 'Admin Without TOTP',
      passwordHash: adminHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: ADMIN_NO_TOTP_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Admin WITH TOTP (totpConfirmedAt: now)
    await testDb.insert(appUser).values({
      id: ADMIN_ENROLLED_ID,
      email: ADMIN_ENROLLED_EMAIL,
      username: 'admin_enrolled',
      fullName: 'Admin Enrolled TOTP',
      passwordHash: adminHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: new Date().toISOString(),
      totpSecretEnc: dummySecretEnc,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: ADMIN_ENROLLED_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Regular user WITHOUT TOTP
    await testDb.insert(appUser).values({
      id: REGULAR_NO_TOTP_ID,
      email: REGULAR_NO_TOTP_EMAIL,
      username: 'regular_no_totp',
      fullName: 'Regular Without TOTP',
      passwordHash: regularHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: REGULAR_NO_TOTP_ID,
      roleId: ROLE_REGULAR_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Regular user WITH TOTP
    await testDb.insert(appUser).values({
      id: REGULAR_ENROLLED_ID,
      email: REGULAR_ENROLLED_EMAIL,
      username: 'regular_enrolled',
      fullName: 'Regular Enrolled TOTP',
      passwordHash: regularHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: new Date().toISOString(),
      totpSecretEnc: dummySecretEnc,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: REGULAR_ENROLLED_ID,
      roleId: ROLE_REGULAR_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 5. Initialize Nest app
    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    authService = app.get(AuthService);
  }, 30000);

  afterAll(async () => {
    delete process.env.AUTH_TOTP_ENFORCE_ADMINS;
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

  describe('Flag true / default (AUTH_TOTP_ENFORCE_ADMINS=true)', () => {
    it('admin without TOTP gets totp_setup_required (current behaviour)', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_NO_TOTP_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('totp_setup_required');
      expect(body.tempToken).toBeDefined();
    });

    it('admin with enrolled TOTP gets totp_required', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_ENROLLED_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('totp_required');
      expect(body.tempToken).toBeDefined();
    });

    it('regular user with enrolled TOTP gets totp_required', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_ENROLLED_EMAIL,
          password: REGULAR_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('totp_required');
      expect(body.tempToken).toBeDefined();
    });

    it('regular user without TOTP signs in normally', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'true';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_NO_TOTP_EMAIL,
          password: REGULAR_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('authenticated');
      expect(body.accessToken).toBeDefined();
    });
  });

  describe('Flag false (AUTH_TOTP_ENFORCE_ADMINS=false)', () => {
    it('admin without TOTP signs in normally (not forced to set up TOTP)', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_NO_TOTP_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('authenticated');
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe(ADMIN_NO_TOTP_EMAIL);
    });

    it('admin with enrolled TOTP still gets totp_required', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_ENROLLED_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('totp_required');
      expect(body.tempToken).toBeDefined();
    });

    it('regular user with enrolled TOTP still gets totp_required', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_ENROLLED_EMAIL,
          password: REGULAR_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('totp_required');
      expect(body.tempToken).toBeDefined();
    });

    it('regular user without TOTP signs in normally', async () => {
      process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';

      const res = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_NO_TOTP_EMAIL,
          password: REGULAR_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('authenticated');
      expect(body.accessToken).toBeDefined();
    });
  });

  describe('Startup warning logging', () => {
    it('logs warning when AUTH_TOTP_ENFORCE_ADMINS=false and NODE_ENV=production', () => {
      const prevTotp = process.env.AUTH_TOTP_ENFORCE_ADMINS;
      const prevNodeEnv = process.env.NODE_ENV;
      const prevEncKey = process.env.ENCRYPTION_KEY;
      const prevHashKey = process.env.IDENTITY_HASH_KEY;
      const prevClamav = process.env.CLAMAV_HOST;
      const prevS3Endpoint = process.env.S3_ENDPOINT;
      const prevS3Bucket = process.env.S3_BUCKET;
      const prevS3Region = process.env.S3_REGION;
      const prevS3Key = process.env.S3_ACCESS_KEY_ID;
      const prevS3Secret = process.env.S3_SECRET_ACCESS_KEY;

      try {
        process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';
        process.env.NODE_ENV = 'production';
        process.env.ENCRYPTION_KEY = 'a'.repeat(32);
        process.env.IDENTITY_HASH_KEY = 'b'.repeat(32);
        process.env.CLAMAV_HOST = '127.0.0.1';
        process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
        process.env.S3_BUCKET = 'idmis-files';
        process.env.S3_REGION = 'auto';
        process.env.S3_ACCESS_KEY_ID = 'prod-key';
        process.env.S3_SECRET_ACCESS_KEY = 'prod-secret';

        const warnSpy = vi.spyOn(authService['logger'], 'warn');
        authService.onApplicationBootstrap();

        expect(warnSpy).toHaveBeenCalledWith('Admin TOTP enforcement is DISABLED');
      } finally {
        if (prevTotp !== undefined) process.env.AUTH_TOTP_ENFORCE_ADMINS = prevTotp;
        else delete process.env.AUTH_TOTP_ENFORCE_ADMINS;

        if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;

        if (prevEncKey !== undefined) process.env.ENCRYPTION_KEY = prevEncKey;
        else delete process.env.ENCRYPTION_KEY;

        if (prevHashKey !== undefined) process.env.IDENTITY_HASH_KEY = prevHashKey;
        else delete process.env.IDENTITY_HASH_KEY;

        if (prevClamav !== undefined) process.env.CLAMAV_HOST = prevClamav;
        else delete process.env.CLAMAV_HOST;

        if (prevS3Endpoint !== undefined) process.env.S3_ENDPOINT = prevS3Endpoint;
        else delete process.env.S3_ENDPOINT;

        if (prevS3Bucket !== undefined) process.env.S3_BUCKET = prevS3Bucket;
        else delete process.env.S3_BUCKET;

        if (prevS3Region !== undefined) process.env.S3_REGION = prevS3Region;
        else delete process.env.S3_REGION;

        if (prevS3Key !== undefined) process.env.S3_ACCESS_KEY_ID = prevS3Key;
        else delete process.env.S3_ACCESS_KEY_ID;

        if (prevS3Secret !== undefined) process.env.S3_SECRET_ACCESS_KEY = prevS3Secret;
        else delete process.env.S3_SECRET_ACCESS_KEY;
      }
    });

    it('does NOT log warning when AUTH_TOTP_ENFORCE_ADMINS=true in production', () => {
      const prevTotp = process.env.AUTH_TOTP_ENFORCE_ADMINS;
      const prevNodeEnv = process.env.NODE_ENV;
      const prevEncKey = process.env.ENCRYPTION_KEY;
      const prevHashKey = process.env.IDENTITY_HASH_KEY;
      const prevClamav = process.env.CLAMAV_HOST;
      const prevS3Endpoint = process.env.S3_ENDPOINT;
      const prevS3Bucket = process.env.S3_BUCKET;
      const prevS3Region = process.env.S3_REGION;
      const prevS3Key = process.env.S3_ACCESS_KEY_ID;
      const prevS3Secret = process.env.S3_SECRET_ACCESS_KEY;

      try {
        process.env.AUTH_TOTP_ENFORCE_ADMINS = 'true';
        process.env.NODE_ENV = 'production';
        process.env.ENCRYPTION_KEY = 'a'.repeat(32);
        process.env.IDENTITY_HASH_KEY = 'b'.repeat(32);
        process.env.CLAMAV_HOST = '127.0.0.1';
        process.env.S3_ENDPOINT = 'https://r2.cloudflarestorage.com';
        process.env.S3_BUCKET = 'idmis-files';
        process.env.S3_REGION = 'auto';
        process.env.S3_ACCESS_KEY_ID = 'prod-key';
        process.env.S3_SECRET_ACCESS_KEY = 'prod-secret';

        const warnSpy = vi.spyOn(authService['logger'], 'warn');
        authService.onApplicationBootstrap();

        expect(warnSpy).not.toHaveBeenCalledWith('Admin TOTP enforcement is DISABLED');
      } finally {
        if (prevTotp !== undefined) process.env.AUTH_TOTP_ENFORCE_ADMINS = prevTotp;
        else delete process.env.AUTH_TOTP_ENFORCE_ADMINS;

        if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;

        if (prevEncKey !== undefined) process.env.ENCRYPTION_KEY = prevEncKey;
        else delete process.env.ENCRYPTION_KEY;

        if (prevHashKey !== undefined) process.env.IDENTITY_HASH_KEY = prevHashKey;
        else delete process.env.IDENTITY_HASH_KEY;

        if (prevClamav !== undefined) process.env.CLAMAV_HOST = prevClamav;
        else delete process.env.CLAMAV_HOST;

        if (prevS3Endpoint !== undefined) process.env.S3_ENDPOINT = prevS3Endpoint;
        else delete process.env.S3_ENDPOINT;

        if (prevS3Bucket !== undefined) process.env.S3_BUCKET = prevS3Bucket;
        else delete process.env.S3_BUCKET;

        if (prevS3Region !== undefined) process.env.S3_REGION = prevS3Region;
        else delete process.env.S3_REGION;

        if (prevS3Key !== undefined) process.env.S3_ACCESS_KEY_ID = prevS3Key;
        else delete process.env.S3_ACCESS_KEY_ID;

        if (prevS3Secret !== undefined) process.env.S3_SECRET_ACCESS_KEY = prevS3Secret;
        else delete process.env.S3_SECRET_ACCESS_KEY;
      }
    });

    it('does NOT log warning when NODE_ENV is test or development', () => {
      const prevTotp = process.env.AUTH_TOTP_ENFORCE_ADMINS;
      const prevNodeEnv = process.env.NODE_ENV;

      try {
        process.env.AUTH_TOTP_ENFORCE_ADMINS = 'false';
        process.env.NODE_ENV = 'test';

        const warnSpy = vi.spyOn(authService['logger'], 'warn');
        authService.onApplicationBootstrap();

        expect(warnSpy).not.toHaveBeenCalledWith('Admin TOTP enforcement is DISABLED');
      } finally {
        if (prevTotp !== undefined) process.env.AUTH_TOTP_ENFORCE_ADMINS = prevTotp;
        else delete process.env.AUTH_TOTP_ENFORCE_ADMINS;

        if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });
  });
});
