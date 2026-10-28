import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { genRequestId, registerRequestIdHook } from '../../platform/logger/logger.config';
import {
  appUser,
  role,
  assignment,
  session,
  totpRecoveryCode,
  rolePermission,
  SYSTEM_USER_ID,
  ROLE_SYSTEM_ADMIN_ID,
  SYSTEM_ROLE_PERMISSIONS,
  eq,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { parseCookies } from './cookie.helper';
import { TokenService } from './token.service';

/**
 * SECURITY SPECIFICATION VERIFICATION:
 * - Refresh tokens: 32+ random bytes, stored as SHA-256 hashes in core.session.refresh_token_hash.
 * - Passwords: Hashed using Argon2id ($argon2id$).
 * - Recovery codes: Hashed using Argon2id ($argon2id$) in core.totp_recovery_code.code_hash.
 */

describe('Authentication (BE-1.3)', () => {
  const TEST_DB_NAME = `idmis_auth_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;
  let app: NestFastifyApplication;

  const ADMIN_USER_ID = '018f3a5e-1111-7000-8000-000000000001';
  const ADMIN_EMAIL = 'admin@idmis.gov.ng';
  const ADMIN_PASSWORD = 'CorrectAdminPass123!';

  const REGULAR_USER_ID = '018f3a5e-2222-7000-8000-000000000002';
  const REGULAR_EMAIL = 'user@idmis.gov.ng';
  const REGULAR_PASSWORD = 'ValidUserPass123!';

  const totpCrypto = new NobleCryptoPlugin();
  const totpBase32 = new ScureBase32Plugin();

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
      email: 'system@idmis.internal',
      username: 'system',
      fullName: 'System',
      passwordHash: '*',
      isActive: false,
      mustChangePassword: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 4. Seed system_admin role
    await testDb.insert(role).values({
      id: ROLE_SYSTEM_ADMIN_ID,
      key: 'system_admin',
      name: 'System Administrator',
      isSystem: true,
    });

    for (const perm of SYSTEM_ROLE_PERMISSIONS.system_admin) {
      await testDb.insert(rolePermission).values({
        roleId: ROLE_SYSTEM_ADMIN_ID,
        permission: perm,
      });
    }

    // 5. Seed System Administrator appUser (totpConfirmedAt: null, mustChangePassword: true)
    const adminPasswordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    await testDb.insert(appUser).values({
      id: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      username: 'admin',
      fullName: 'System Administrator',
      passwordHash: adminPasswordHash,
      isActive: true,
      mustChangePassword: true,
      totpConfirmedAt: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Assignment for admin
    await testDb.insert(assignment).values({
      id: '018f3a5e-1111-7000-8000-000000000009',
      userId: ADMIN_USER_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 6. Seed regular user (totpConfirmedAt: null, mustChangePassword: false)
    const regularPasswordHash = await argon2.hash(REGULAR_PASSWORD, { type: argon2.argon2id });
    await testDb.insert(appUser).values({
      id: REGULAR_USER_ID,
      email: REGULAR_EMAIL,
      username: 'regular_user',
      fullName: 'Regular User',
      passwordHash: regularPasswordHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 7. Start NestJS Fastify App
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
      } catch (err) {
        console.error('Failed to cleanup test database:', err);
      }
      await adminClient.end();
    }
  });

  describe('1. SYSTEM_USER_ID Rejection', () => {
    it('rejects SYSTEM_USER_ID unconditionally at sign-in', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: 'system@idmis.internal',
          password: 'AnyPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Unauthorized');
      expect(body.type).toBe('/errors/unauthorized');
    });
  });

  describe('2. Refresh Token Rotation and Storage Integrity', () => {
    let currentCookie: string;
    let oldRefreshToken: string;
    let newCookie: string;
    let familyId: string;

    it('signs in and issues a rotating refresh token in an httpOnly cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_EMAIL,
          password: REGULAR_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('authenticated');
      expect(body.accessToken).toBeDefined();
      expect(body.expiresIn).toBe(900);
      expect(body.user.email).toBe(REGULAR_EMAIL);

      // Verify cookie
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookies = parseCookies(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie);
      expect(cookies.refreshToken).toBeDefined();
      oldRefreshToken = cookies.refreshToken;
      currentCookie = `refreshToken=${oldRefreshToken}`;

      // Verify DB storage: Refresh token stored as SHA-256 hash
      const hash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
      const sessions = await testDb
        .select()
        .from(session)
        .where(eq(session.refreshTokenHash, hash));

      expect(sessions.length).toBe(1);
      expect(sessions[0].userId).toBe(REGULAR_USER_ID);
      expect(sessions[0].revokedAt).toBeNull();
      expect(sessions[0].replacedBySessionId).toBeNull();
      familyId = sessions[0].familyId;
    });

    it('rotates refresh token: old session replaced, new token issued', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          cookie: currentCookie,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe(REGULAR_EMAIL);

      // Extract new refresh token
      const setCookie = response.headers['set-cookie'];
      const cookies = parseCookies(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie);
      expect(cookies.refreshToken).toBeDefined();
      expect(cookies.refreshToken).not.toBe(oldRefreshToken);
      newCookie = `refreshToken=${cookies.refreshToken}`;

      // Verify old session in DB is marked replaced and revoked
      const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
      const oldSessions = await testDb
        .select()
        .from(session)
        .where(eq(session.refreshTokenHash, oldHash));

      expect(oldSessions[0].revokedAt).not.toBeNull();
      expect(oldSessions[0].replacedBySessionId).not.toBeNull();

      // Verify new session shares same family_id
      const newHash = crypto.createHash('sha256').update(cookies.refreshToken).digest('hex');
      const newSessions = await testDb
        .select()
        .from(session)
        .where(eq(session.refreshTokenHash, newHash));

      expect(newSessions[0].familyId).toBe(familyId);
      expect(newSessions[0].replacedBySessionId).toBeNull();
      expect(newSessions[0].revokedAt).toBeNull();
    });

    it('accepts bodyless POST /auth/refresh with credentials cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          cookie: newCookie,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();
      expect(body.user.email).toBe(REGULAR_EMAIL);

      // Update newCookie for subsequent tests
      const setCookie = response.headers['set-cookie'];
      const cookies = parseCookies(Array.isArray(setCookie) ? setCookie.join('; ') : setCookie);
      newCookie = `refreshToken=${cookies.refreshToken}`;
    });

    it('reuse of an old refresh token revokes the entire session family', async () => {
      // Re-use the already rotated oldRefreshToken!
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          cookie: `refreshToken=${oldRefreshToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain('Refresh token reuse detected');

      // Verify ALL sessions in this family are now revoked!
      const allFamilySessions = await testDb
        .select()
        .from(session)
        .where(eq(session.familyId, familyId));

      expect(allFamilySessions.length).toBeGreaterThanOrEqual(2);
      for (const sess of allFamilySessions) {
        expect(sess.revokedAt).not.toBeNull();
      }

      // Subsequent attempt with the new token must now ALSO be rejected!
      const subsequentResponse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          cookie: newCookie,
        },
        payload: {},
      });

      expect(subsequentResponse.statusCode).toBe(401);
    });
  });

  describe('3. Account Lockout and Anti-Enumeration', () => {
    const LOCKOUT_EMAIL = 'lockout_test@idmis.gov.ng';

    beforeAll(async () => {
      const hash = await argon2.hash('SecretPass123!', { type: argon2.argon2id });
      await testDb.insert(appUser).values({
        id: '018f3a5e-3333-7000-8000-000000000003',
        email: LOCKOUT_EMAIL,
        username: 'lockout_user',
        fullName: 'Lockout Test',
        passwordHash: hash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });
    });

    it('locks account in database on 5th failure and returns the same 401 response', async () => {
      // 4 wrong attempts -> 401
      for (let i = 1; i <= 4; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: {
            email: LOCKOUT_EMAIL,
            password: 'WrongPassword!',
          },
        });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).detail).toBe('Invalid email or password');
      }

      // 5th wrong attempt -> 401 (Lockout triggered in app_user DB record!)
      const fifthRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: LOCKOUT_EMAIL,
          password: 'WrongPassword!',
        },
      });
      expect(fifthRes.statusCode).toBe(401);
      const fifthBody = JSON.parse(fifthRes.body);
      expect(fifthBody.title).toBe('Unauthorized');
      expect(fifthBody.detail).toBe('Invalid email or password');

      // Verify in DB that user has failed_sign_ins = 5 and locked_until in the future
      const lockedInDb = await testDb
        .select()
        .from(appUser)
        .where(eq(appUser.email, LOCKOUT_EMAIL));
      expect(lockedInDb[0].failedSignIns).toBe(5);
      expect(lockedInDb[0].lockedUntil).not.toBeNull();
      expect(new Date(lockedInDb[0].lockedUntil!).getTime()).toBeGreaterThan(Date.now());

      // 6th attempt (even with CORRECT password) is locked out and returns the same 401!
      const sixthRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: LOCKOUT_EMAIL,
          password: 'SecretPass123!',
        },
      });
      expect(sixthRes.statusCode).toBe(401);
      const sixthBody = JSON.parse(sixthRes.body);
      expect(sixthBody.title).toBe('Unauthorized');
      expect(sixthBody.detail).toBe('Invalid email or password');
    });

    it('returns identical 401 responses for unknown email and wrong password (anti-enumeration)', async () => {
      const unknownEmailRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: 'definitely-unknown-user-999@idmis.gov.ng',
          password: 'SomePassword123!',
        },
      });

      const wrongPasswordRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: REGULAR_EMAIL,
          password: 'DefinitelyWrongPassword123!',
        },
      });

      expect(unknownEmailRes.statusCode).toBe(401);
      expect(wrongPasswordRes.statusCode).toBe(401);

      const unknownBody = JSON.parse(unknownEmailRes.body);
      const wrongBody = JSON.parse(wrongPasswordRes.body);

      expect(unknownBody.status).toBe(wrongBody.status);
      expect(unknownBody.title).toBe(wrongBody.title);
      expect(unknownBody.type).toBe(wrongBody.type);
      expect(unknownBody.detail).toBe(wrongBody.detail);
      expect(unknownBody.detail).toBe('Invalid email or password');
    });
  });

  describe('4. System Administrator TOTP Setup, Verification & Recovery Code', () => {
    let setupTempToken: string;
    let totpSecret: string;
    let recoveryCodes: string[];

    it('requires TOTP setup for System Administrator on first sign-in', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('totp_setup_required');
      expect(body.tempToken).toBeDefined();
      setupTempToken = body.tempToken;
    });

    it('sets up TOTP and returns secret, URI, and 10 Argon2id recovery codes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        payload: {
          tempToken: setupTempToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.secret).toBeDefined();
      expect(body.otpauthUrl).toContain('otpauth://totp/TRIMING%20IDMIS:admin%40idmis.gov.ng');
      expect(body.recoveryCodes).toBeInstanceOf(Array);
      expect(body.recoveryCodes.length).toBe(10);

      totpSecret = body.secret;
      recoveryCodes = body.recoveryCodes;

      // Verify recovery codes are stored in DB hashed with Argon2id
      const dbCodes = await testDb
        .select()
        .from(totpRecoveryCode)
        .where(eq(totpRecoveryCode.userId, ADMIN_USER_ID));

      expect(dbCodes.length).toBe(10);
      for (const c of dbCodes) {
        expect(c.codeHash.startsWith('$argon2id$')).toBe(true);
        expect(c.usedAt).toBeNull();
      }
    });

    it('verifies TOTP code, sets totpConfirmedAt, and enforces password change', async () => {
      // Obtain fresh tempToken for verify
      const signinRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      const verifyTempToken = JSON.parse(signinRes.body).tempToken;

      // Generate valid TOTP token
      const totp = new TOTP({
        secret: totpSecret,
        crypto: totpCrypto,
        base32: totpBase32,
      });
      const validCode = await totp.generate();

      const response = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: {
          tempToken: verifyTempToken,
          totpCode: validCode,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Because mustChangePassword is true for initial admin, status is password_change_required!
      expect(body.status).toBe('password_change_required');
      expect(body.tempToken).toBeDefined();

      // Verify totpConfirmedAt is set in database
      const user = await testDb.select().from(appUser).where(eq(appUser.id, ADMIN_USER_ID));

      expect(user[0].totpConfirmedAt).not.toBeNull();
    });

    it('proves recovery code works and is strictly single-use', async () => {
      // Sign-in: Now that TOTP is enabled, sign-in returns totp_required
      const signinRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      expect(JSON.parse(signinRes.body).status).toBe('totp_required');
      const tempToken = JSON.parse(signinRes.body).tempToken;

      const codeToUse = recoveryCodes[0];

      // 1. Verify with recovery code
      const response = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: {
          tempToken,
          recoveryCode: codeToUse,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe('password_change_required');

      // Verify in DB that code is marked used
      const dbCodes = await testDb
        .select()
        .from(totpRecoveryCode)
        .where(eq(totpRecoveryCode.userId, ADMIN_USER_ID));

      const usedCodes = dbCodes.filter((c) => c.usedAt !== null);
      expect(usedCodes.length).toBe(1);

      // 2. Next sign-in trying to use the SAME recovery code fails!
      const nextSignin = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      const nextTempToken = JSON.parse(nextSignin.body).tempToken;

      const reuseResponse = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: {
          tempToken: nextTempToken,
          recoveryCode: codeToUse,
        },
      });

      expect(reuseResponse.statusCode).toBe(401);
      expect(JSON.parse(reuseResponse.body).title).toBe('Unauthorized');
    });

    it('disallows calling setup after TOTP has already been verified', async () => {
      // ADMIN_USER_ID has already confirmed TOTP above.
      // Mint a temporary token with purpose totp_setup for ADMIN_USER_ID to simulate bypass attempt
      const tokenService = app.get(TokenService);
      const forgedSetupToken = await tokenService.createTempToken(ADMIN_USER_ID, 'totp_setup');

      const response = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        payload: {
          tempToken: forgedSetupToken,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.detail).toContain('TOTP has already been configured and verified');
    });

    it('proves calling setup twice before verify overwrites the secret without leaving two valid secrets, and burns tempToken on success', async () => {
      const TWICE_USER_ID = crypto.randomUUID();
      const TWICE_EMAIL = `setup-twice-${Date.now()}@idmis.gov.ng`;
      const TWICE_PASSWORD = 'SetupTwicePass123!';
      const twiceHash = await argon2.hash(TWICE_PASSWORD, { type: argon2.argon2id });

      await testDb.insert(appUser).values({
        id: TWICE_USER_ID,
        email: TWICE_EMAIL,
        username: `setup_twice_${Date.now()}`,
        fullName: 'Setup Twice User',
        passwordHash: twiceHash,
        isActive: true,
        mustChangePassword: false,
        totpConfirmedAt: null,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(assignment).values({
        id: crypto.randomUUID(),
        userId: TWICE_USER_ID,
        roleId: ROLE_SYSTEM_ADMIN_ID,
        module: 'core',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // 1. Initial sign-in yields setup tempToken
      const signinRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: TWICE_EMAIL, password: TWICE_PASSWORD },
      });
      const tempToken = JSON.parse(signinRes.body).tempToken;

      // 2. First call to setup -> secret 1
      const setupRes1 = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        payload: { tempToken },
      });
      expect(setupRes1.statusCode).toBe(200);
      const secret1 = JSON.parse(setupRes1.body).secret;

      // 3. Second call to setup -> secret 2
      const setupRes2 = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        payload: { tempToken },
      });
      expect(setupRes2.statusCode).toBe(200);
      const secret2 = JSON.parse(setupRes2.body).secret;

      expect(secret1).not.toBe(secret2);

      // 4. Generate code with secret 1 -> verify must fail!
      const totp1 = new TOTP({ secret: secret1, crypto: totpCrypto, base32: totpBase32 });
      const code1 = await totp1.generate();

      const verifyRes1 = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: { tempToken, totpCode: code1 },
      });
      expect(verifyRes1.statusCode).toBe(401);
      expect(JSON.parse(verifyRes1.body).detail).toBe('Invalid TOTP code');

      // 5. Generate code with secret 2 -> verify must succeed!
      const totp2 = new TOTP({ secret: secret2, crypto: totpCrypto, base32: totpBase32 });
      const code2 = await totp2.generate();

      const verifyRes2 = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: { tempToken, totpCode: code2 },
      });
      expect(verifyRes2.statusCode).toBe(200);

      // 6. Proves tempToken is burned on verify success: calling verify again with same tempToken fails!
      const replayRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: { tempToken, totpCode: code2 },
      });
      expect(replayRes.statusCode).toBe(401);
      expect(JSON.parse(replayRes.body).detail).toBe('Temporary token has already been used');
    });

    it('enforces lockout rules on verify: fails after 5 bad codes and locks account for 15 minutes', async () => {
      const LOCKOUT_USER_ID = crypto.randomUUID();
      const LOCKOUT_EMAIL = `totp-lockout-${Date.now()}@idmis.gov.ng`;
      const LOCKOUT_PASSWORD = 'LockoutTotpPass123!';
      const lockoutHash = await argon2.hash(LOCKOUT_PASSWORD, { type: argon2.argon2id });

      await testDb.insert(appUser).values({
        id: LOCKOUT_USER_ID,
        email: LOCKOUT_EMAIL,
        username: `totp_lockout_${Date.now()}`,
        fullName: 'TOTP Lockout User',
        passwordHash: lockoutHash,
        isActive: true,
        mustChangePassword: false,
        totpConfirmedAt: null,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      await testDb.insert(assignment).values({
        id: crypto.randomUUID(),
        userId: LOCKOUT_USER_ID,
        roleId: ROLE_SYSTEM_ADMIN_ID,
        module: 'core',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const signinRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: LOCKOUT_EMAIL, password: LOCKOUT_PASSWORD },
      });
      const tempToken = JSON.parse(signinRes.body).tempToken;

      const setupRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        payload: { tempToken },
      });
      expect(setupRes.statusCode).toBe(200);
      const secret = JSON.parse(setupRes.body).secret;

      // 4 failed attempts with invalid code
      for (let attempt = 1; attempt <= 4; attempt++) {
        const badRes = await app.inject({
          method: 'POST',
          url: '/auth/totp/verify',
          payload: { tempToken, totpCode: '000000' },
        });
        expect(badRes.statusCode).toBe(401);
        expect(JSON.parse(badRes.body).detail).toBe('Invalid TOTP code');

        const dbUser = await testDb.select().from(appUser).where(eq(appUser.id, LOCKOUT_USER_ID));
        expect(dbUser[0].failedSignIns).toBe(attempt);
        expect(dbUser[0].lockedUntil).toBeNull();
      }

      // 5th failed attempt locks the account!
      const fifthRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: { tempToken, totpCode: '000000' },
      });
      expect(fifthRes.statusCode).toBe(401);
      expect(JSON.parse(fifthRes.body).detail).toContain(
        'Account has been locked due to too many failed attempts',
      );

      const lockedUser = await testDb.select().from(appUser).where(eq(appUser.id, LOCKOUT_USER_ID));
      expect(lockedUser[0].failedSignIns).toBe(5);
      expect(lockedUser[0].lockedUntil).not.toBeNull();
      const lockedUntilDate = new Date(lockedUser[0].lockedUntil!);
      expect(lockedUntilDate.getTime()).toBeGreaterThan(Date.now() + 10 * 60 * 1000);

      // 6th attempt (even with valid TOTP code) is rejected because account is locked!
      const totp = new TOTP({ secret, crypto: totpCrypto, base32: totpBase32 });
      const validCode = await totp.generate();

      const sixthRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: { tempToken, totpCode: validCode },
      });
      expect(sixthRes.statusCode).toBe(401);
      expect(JSON.parse(sixthRes.body).detail).toContain('Account is locked');

      // Regular sign-in also rejected due to account lockout
      const signinLocked = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: LOCKOUT_EMAIL, password: LOCKOUT_PASSWORD },
      });
      expect(signinLocked.statusCode).toBe(401);
    });
  });

  describe('5. must_change_password Enforcement and Password Change', () => {
    let passwordChangeToken: string;
    const NEW_PASSWORD = 'BrandNewPassword2026!';

    it('changes password using password_change tempToken and rejects common passwords', async () => {
      const signinRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      const totpToken = JSON.parse(signinRes.body).tempToken;

      const totp = new TOTP({
        secret: (
          await testDb.select().from(appUser).where(eq(appUser.id, ADMIN_USER_ID))
        )[0].totpSecretEnc!.toString('utf-8'),
        crypto: totpCrypto,
        base32: totpBase32,
      });
      const validCode = await totp.generate();

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        payload: {
          tempToken: totpToken,
          totpCode: validCode,
        },
      });

      passwordChangeToken = JSON.parse(verifyRes.body).tempToken;

      // 1. Rejects common password
      const commonRes = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        payload: {
          tempToken: passwordChangeToken,
          currentPassword: ADMIN_PASSWORD,
          newPassword: 'password123',
        },
      });
      expect(commonRes.statusCode).toBe(400);

      // 2. Accepts strong new password
      const successRes = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        payload: {
          tempToken: passwordChangeToken,
          currentPassword: ADMIN_PASSWORD,
          newPassword: NEW_PASSWORD,
        },
      });

      expect(successRes.statusCode).toBe(200);
      expect(JSON.parse(successRes.body).success).toBe(true);

      // Verify in DB that must_change_password is now false
      const adminInDb = await testDb.select().from(appUser).where(eq(appUser.id, ADMIN_USER_ID));

      expect(adminInDb[0].mustChangePassword).toBe(false);
      expect(adminInDb[0].passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('enforces that authenticated user with mustChangePassword=true cannot access other routes', async () => {
      // Create user with mustChangePassword: true
      const forcedUserId = '018f3a5e-4444-7000-8000-000000000004';
      const hash = await argon2.hash('TempPassword123!', { type: argon2.argon2id });
      await testDb.insert(appUser).values({
        id: forcedUserId,
        email: 'forced_change@idmis.gov.ng',
        username: 'forced_user',
        fullName: 'Forced User',
        passwordHash: hash,
        isActive: true,
        mustChangePassword: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Create valid session to get accessToken
      const sid = crypto.randomUUID();
      const rawRefresh = crypto.randomBytes(32).toString('hex');
      const hashRefresh = crypto.createHash('sha256').update(rawRefresh).digest('hex');
      await testDb.insert(session).values({
        id: sid,
        familyId: sid,
        userId: forcedUserId,
        refreshTokenHash: hashRefresh,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const { TokenService } = await import('./token.service');
      const tokenService = app.get(TokenService);
      const { accessToken } = await tokenService.createAccessToken(forcedUserId, sid);

      // Calling protected route (not change-password, sign-out, me) returns 403 Forbidden!
      const resetAttempt = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          userId: REGULAR_USER_ID,
        },
      });

      expect(resetAttempt.statusCode).toBe(403);
      expect(JSON.parse(resetAttempt.body).title).toBe('Forbidden');
    });
  });

  describe('6. Cryptographic Hash Algorithms Verification', () => {
    it('confirms refresh tokens are stored as SHA-256 and passwords/recovery codes use Argon2id', async () => {
      // 1. Password hash verification
      const user = await testDb.select().from(appUser).where(eq(appUser.id, ADMIN_USER_ID));

      expect(user[0].passwordHash.startsWith('$argon2id$')).toBe(true);

      // 2. Recovery code hash verification
      const codes = await testDb
        .select()
        .from(totpRecoveryCode)
        .where(eq(totpRecoveryCode.userId, ADMIN_USER_ID));

      expect(codes.length).toBeGreaterThan(0);
      for (const c of codes) {
        expect(c.codeHash.startsWith('$argon2id$')).toBe(true);
      }

      // 3. Refresh token hash verification (64 hex characters = SHA-256)
      const sessions = await testDb.select().from(session);
      expect(sessions.length).toBeGreaterThan(0);
      for (const s of sessions) {
        expect(s.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe('7. Origin Header Security Check', () => {
    it('rejects /auth/refresh and /auth/sign-out when Origin does not match APP_URL with 403', async () => {
      // 1. Refresh with disallowed origin
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          origin: 'http://malicious-attacker.com',
          cookie: 'refreshToken=dummyToken',
        },
        payload: {},
      });

      expect(refreshRes.statusCode).toBe(403);
      expect(JSON.parse(refreshRes.body).title).toBe('Forbidden');

      // 2. Sign-out with disallowed origin
      const signoutRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: {
          origin: 'http://malicious-attacker.com',
          cookie: 'refreshToken=dummyToken',
        },
      });

      expect(signoutRes.statusCode).toBe(403);
      expect(JSON.parse(signoutRes.body).title).toBe('Forbidden');
    });
  });

  describe('8. Session Revocation & Inactive / Soft-Deleted User Rejection', () => {
    it('revokes all of the users other sessions on password change while keeping the current one', async () => {
      const multiSessionUserId = '018f3a5e-5555-7000-8000-000000000005';
      const initialPassword = 'InitialPassword123!';
      const hash = await argon2.hash(initialPassword, { type: argon2.argon2id });
      await testDb.insert(appUser).values({
        id: multiSessionUserId,
        email: 'multisession@idmis.gov.ng',
        username: 'multisession_user',
        fullName: 'MultiSession User',
        passwordHash: hash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const { TokenService } = await import('./token.service');
      const tokenService = app.get(TokenService);

      // Create session 1 (current)
      const sid1 = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sid1,
        familyId: sid1,
        userId: multiSessionUserId,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const { accessToken: accessToken1 } = await tokenService.createAccessToken(
        multiSessionUserId,
        sid1,
      );

      // Create session 2 (other session)
      const sid2 = crypto.randomUUID();
      await testDb.insert(session).values({
        id: sid2,
        familyId: sid2,
        userId: multiSessionUserId,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      // Change password using session 1
      const changeRes = await app.inject({
        method: 'POST',
        url: '/auth/change-password',
        headers: {
          authorization: `Bearer ${accessToken1}`,
        },
        payload: {
          currentPassword: initialPassword,
          newPassword: 'UpdatedPassword2026!',
        },
      });

      expect(changeRes.statusCode).toBe(200);

      // Verify in DB: session 1 remains ACTIVE, session 2 is REVOKED
      const dbSession1 = await testDb.select().from(session).where(eq(session.id, sid1));
      const dbSession2 = await testDb.select().from(session).where(eq(session.id, sid2));

      expect(dbSession1[0].revokedAt).toBeNull();
      expect(dbSession2[0].revokedAt).not.toBeNull();
    });

    it('revokes all sessions on admin reset password', async () => {
      const resetTargetUserId = '018f3a5e-6666-7000-8000-000000000006';
      const hash = await argon2.hash('TargetPassword123!', { type: argon2.argon2id });
      await testDb.insert(appUser).values({
        id: resetTargetUserId,
        email: 'reset_target@idmis.gov.ng',
        username: 'reset_target_user',
        fullName: 'Reset Target User',
        passwordHash: hash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // Create 2 sessions for target user
      const s1 = crypto.randomUUID();
      const s2 = crypto.randomUUID();
      await testDb.insert(session).values([
        {
          id: s1,
          familyId: s1,
          userId: resetTargetUserId,
          refreshTokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          id: s2,
          familyId: s2,
          userId: resetTargetUserId,
          refreshTokenHash: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);

      // Admin access token (ensure admin has completed password change)
      await testDb
        .update(appUser)
        .set({ mustChangePassword: false })
        .where(eq(appUser.id, ADMIN_USER_ID));

      const { TokenService } = await import('./token.service');
      const tokenService = app.get(TokenService);
      const adminSid = crypto.randomUUID();
      await testDb.insert(session).values({
        id: adminSid,
        familyId: adminSid,
        userId: ADMIN_USER_ID,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const { accessToken: adminToken } = await tokenService.createAccessToken(
        ADMIN_USER_ID,
        adminSid,
      );

      const resetRes = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          userId: resetTargetUserId,
        },
      });

      expect(resetRes.statusCode).toBe(200);
      const resetBody = JSON.parse(resetRes.body);
      expect(resetBody.temporaryPassword).toBeDefined();
      expect(resetBody.mustChangePassword).toBe(true);

      // Verify ALL sessions of resetTargetUserId are revoked
      const targetSessions = await testDb
        .select()
        .from(session)
        .where(eq(session.userId, resetTargetUserId));

      expect(targetSessions.length).toBe(2);
      expect(targetSessions[0].revokedAt).not.toBeNull();
      expect(targetSessions[1].revokedAt).not.toBeNull();
    });

    it('auth guard rejects requests whose user is inactive or soft-deleted even with valid session', async () => {
      const lifecycleUserId = '018f3a5e-7777-7000-8000-000000000007';
      const hash = await argon2.hash('LifecyclePass123!', { type: argon2.argon2id });
      await testDb.insert(appUser).values({
        id: lifecycleUserId,
        email: 'lifecycle_user@idmis.gov.ng',
        username: 'lifecycle_user',
        fullName: 'Lifecycle User',
        passwordHash: hash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      const { TokenService } = await import('./token.service');
      const tokenService = app.get(TokenService);
      const lifeSid = crypto.randomUUID();
      await testDb.insert(session).values({
        id: lifeSid,
        familyId: lifeSid,
        userId: lifecycleUserId,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const { accessToken } = await tokenService.createAccessToken(lifecycleUserId, lifeSid);

      // 1. Initial check: Active user with valid session -> 200 OK
      const initialMe = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      expect(initialMe.statusCode).toBe(200);

      // 2. Deactivate user -> 401 Unauthorized
      await testDb.update(appUser).set({ isActive: false }).where(eq(appUser.id, lifecycleUserId));

      const deactivatedMe = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      expect(deactivatedMe.statusCode).toBe(401);
      expect(JSON.parse(deactivatedMe.body).title).toBe('Unauthorized');

      // 3. Reactivate then soft-delete user -> 401 Unauthorized
      await testDb
        .update(appUser)
        .set({ isActive: true, deletedAt: new Date().toISOString() })
        .where(eq(appUser.id, lifecycleUserId));

      const deletedMe = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      expect(deletedMe.statusCode).toBe(401);
      expect(JSON.parse(deletedMe.body).title).toBe('Unauthorized');
    });
  });
});
