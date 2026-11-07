import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'node:net';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import { genRequestId, registerRequestIdHook } from '../../platform/logger/logger.config';
import { registerRateLimit } from '../../platform/rate-limit/rate-limit.config';
import { AntivirusService } from '../../platform/storage/antivirus.service';
import { StorageService } from '../../platform/storage/storage.service';
import { TokenService } from './token.service';
import { Readable } from 'node:stream';
import {
  appUser,
  role,
  assignment,
  session,
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

describe('Security Hardening Specification (BE-5.4)', () => {
  const TEST_DB_NAME = `idmis_test_sec_hardening_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const baseAdminUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/idmis';
  const urlObj = new URL(baseAdminUrl);
  urlObj.pathname = `/${TEST_DB_NAME}`;
  const testDbUrl = urlObj.toString();

  let adminClient: ReturnType<typeof postgres>;
  let testClient: ReturnType<typeof postgres>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testDb: any;
  let app: NestFastifyApplication;
  let antivirusService: AntivirusService;
  let storageService: StorageService;

  // ClamAV TCP Mock Server
  let clamServer: net.Server;
  let clamPort: number;

  const ADMIN_USER_ID = '018f3a5e-4444-7000-8000-000000000001';
  const ADMIN_EMAIL = 'admin_sec@idmis.internal';
  const ADMIN_PASSWORD = 'AdminSecurePassword123!';
  let adminAccessToken: string;

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
      fullName: 'System User',
      passwordHash: '*',
      isActive: false,
      mustChangePassword: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 4. Seed system_admin role
    await testDb
      .insert(role)
      .values({
        id: ROLE_SYSTEM_ADMIN_ID,
        key: 'system_admin',
        name: 'System Administrator',
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

    // 5. Seed Admin appUser with totpConfirmedAt = null
    const adminPasswordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    await testDb.insert(appUser).values({
      id: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      username: 'admin_sec',
      fullName: 'Security Admin',
      passwordHash: adminPasswordHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Seed system_admin assignment
    await testDb.insert(assignment).values({
      id: '018f3a5e-4444-7000-8000-000000000009',
      userId: ADMIN_USER_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 6. Create valid active session & token for admin user
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await testDb.insert(session).values({
      id: sessionId,
      familyId: crypto.randomUUID(),
      userId: ADMIN_USER_ID,
      refreshTokenHash: 'dummy_hash',
      expiresAt: expiresAt.toISOString(),
    });

    // 7. Start TCP Mock ClamAV Daemon
    await new Promise<void>((resolve) => {
      clamServer = net.createServer((socket) => {
        let streamData = Buffer.alloc(0);

        socket.on('data', (chunk) => {
          streamData = Buffer.concat([streamData, chunk]);
          // Check if stream terminated with 0-length chunk: 0x00 0x00 0x00 0x00
          if (
            streamData.length >= 4 &&
            streamData.subarray(streamData.length - 4).equals(Buffer.from([0, 0, 0, 0]))
          ) {
            const content = streamData.toString('utf-8');
            if (content.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE!')) {
              socket.write('stream: Win.Test.EICAR_HDB-1 FOUND\0');
            } else {
              socket.write('stream: OK\0');
            }
            socket.end();
          }
        });
      });

      clamServer.listen(0, '127.0.0.1', () => {
        const addr = clamServer.address() as net.AddressInfo;
        clamPort = addr.port;
        process.env.CLAMAV_HOST = '127.0.0.1';
        process.env.CLAMAV_PORT = String(clamPort);
        resolve();
      });
    });

    // 8. Start Fastify App with Rate Limit
    const adapter = new FastifyAdapter({
      logger: false,
      genReqId: genRequestId,
      trustProxy: true,
    });
    registerRequestIdHook(adapter.getInstance());
    await registerRateLimit(adapter.getInstance(), { redisClient: null });

    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    antivirusService = app.get(AntivirusService);
    storageService = app.get(StorageService);

    const tokenService = app.get(TokenService);
    const tokenResult = await tokenService.createAccessToken(ADMIN_USER_ID, sessionId);
    adminAccessToken = tokenResult.accessToken;
  }, 30000);

  afterAll(async () => {
    if (clamServer) {
      clamServer.close();
    }
    if (app) await app.close();
    if (testClient) await testClient.end({ timeout: 5 });
    if (adminClient) {
      try {
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      } catch {
        // ignore drop error
      }
      await adminClient.end({ timeout: 5 });
    }
  });

  describe('1. Rate Limiting (@fastify/rate-limit)', () => {
    it('hammer login with 6 attempts -> 6th gets 429 problem+json with Retry-After', async () => {
      const email = 'hammer_test@idmis.internal';

      // 5 attempts allowed by rate limiter (returns 401 Unauthorized for bad creds)
      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: {
            email,
            password: 'BadPassword!',
          },
        });
        expect(res.statusCode).toBe(401);
      }

      // 6th attempt is throttled -> 429
      const sixthRes = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email,
          password: 'BadPassword!',
        },
      });

      expect(sixthRes.statusCode).toBe(429);
      expect(sixthRes.headers['retry-after']).toBeDefined();
      expect(sixthRes.headers['content-type']).toContain('application/problem+json');

      const body = JSON.parse(sixthRes.body);
      expect(body.status).toBe(429);
      expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.type).toBe('/errors/rate-limit-exceeded');
    });
  });

  describe('2. Real ClamAV over TCP INSTREAM', () => {
    it('scans clean file stream via real clamd mock -> clean', async () => {
      const cleanStream = Readable.from([Buffer.from('Clean harmless file content')]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (storageService.getClient().send as any) = async () => ({ Body: cleanStream });

      const result = await antivirusService.scanFile('files/clean-test-file');
      expect(result.scanStatus).toBe('clean');
      expect(result.virusDetails).toBeNull();
    });

    it('upload EICAR via real clamd mock -> infected + storage object deleted', async () => {
      const eicarPayload = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );
      const infectedStream = Readable.from([eicarPayload]);
      let deleteCalled = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (storageService.getClient().send as any) = async (cmd: any) => {
        if (cmd.constructor?.name === 'DeleteObjectCommand') {
          deleteCalled = true;
          return {};
        }
        return { Body: infectedStream };
      };

      const result = await antivirusService.scanFile('files/eicar-test');
      expect(result.scanStatus).toBe('infected');
      expect(result.virusDetails).toContain('EICAR');
      expect(deleteCalled).toBe(true);
    });

    it('clamd unreachable -> file stays pending (never clean)', async () => {
      process.env.CLAMAV_PORT = '59999'; // Invalid unreachable port
      const cleanStream = Readable.from([Buffer.from('Clean file during clamd outage')]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (storageService.getClient().send as any) = async () => ({ Body: cleanStream });

      const result = await antivirusService.scanFile('files/outage-file');
      expect(result.scanStatus).toBe('failed');
      expect(result.scanStatus).not.toBe('clean');

      // Restore port
      process.env.CLAMAV_PORT = String(clamPort);
    });
  });

  describe('3. TOTP Enforcement for Admin-Level Permissions/Roles', () => {
    let totpSecret: string;

    it('admin user without TOTP hits /dashboards -> 403 totp_required', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/dashboards/programme',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.detail).toBe('totp_required');
    });

    it('admin user without TOTP hits /auth/totp/setup -> 200 with secret and 10 recovery codes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/totp/setup',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.secret).toBeDefined();
      expect(body.otpauthUrl).toContain('TRIMING%20IDMIS');
      expect(body.recoveryCodes).toHaveLength(10);

      totpSecret = body.secret;
    });

    it('admin user completes TOTP verify -> subsequent /dashboards request succeeds (not 403 totp_required)', async () => {
      const totp = new TOTP({
        secret: totpSecret,
        crypto: totpCrypto,
        base32: totpBase32,
      });
      const validCode = await totp.generate();

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/totp/verify',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
        payload: {
          totpCode: validCode,
        },
      });

      expect(verifyRes.statusCode).toBe(200);

      // Now hit /dashboards -> user is no longer blocked by totp_required
      const dashRes = await app.inject({
        method: 'GET',
        url: '/dashboards/programme',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(dashRes.statusCode).not.toBe(403);
    });
  });
});
