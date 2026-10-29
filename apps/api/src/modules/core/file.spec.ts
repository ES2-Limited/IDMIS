import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { Readable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module';
import { ProblemDetailsFilter } from '../../platform/filters';
import {
  appUser,
  role,
  rolePermission,
  assignment,
  file,
  outboxEvent,
  auditLog,
  session,
  SYSTEM_USER_ID,
  ROLE_SYSTEM_ADMIN_ID,
  postgres,
  drizzle,
  migrate,
  setDatabaseUrl,
} from '@idmis/db';
import * as schema from '@idmis/db';
import { permissions } from '@idmis/contracts';
import { TokenService } from '../auth/token.service';
import { StorageService } from '../../platform/storage/storage.service';
import { initAuditWriter } from '../../platform/audit/audit-writer';
import { resetAuditWriter } from '../../platform/database/transaction.helper';

describe('File Storage API Specification (BE-1.7)', () => {
  const TEST_DB_NAME = `idmis_file_test_${Date.now()}`;
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

  const USER_ADMIN_ID = '018f3a5e-1000-7000-8000-000000000001';
  let adminToken: string;

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl);
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });
    setDatabaseUrl(testDbUrl);

    // Apply migrations
    const migrationsFolder = path.resolve(__dirname, '../../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });

    initAuditWriter();

    // Bootstrap NestJS application
    const adapter = new FastifyAdapter();
    try {
      app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
        logger: ['error', 'warn', 'log'],
      });
      app.useGlobalFilters(new ProblemDetailsFilter());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    } catch (err) {
      console.error('Nest initialization error:', err);
      throw err;
    }

    tokenService = app.get(TokenService);
    storageService = app.get(StorageService);

    // Seed test admin user with role & permissions
    const passwordHash = await argon2.hash('TestAdminPass123!');
    await testDb
      .insert(appUser)
      .values({
        id: SYSTEM_USER_ID,
        email: 'system@idmis.local',
        fullName: 'System User',
        passwordHash,
        isActive: true,
      })
      .onConflictDoNothing();

    await testDb
      .insert(appUser)
      .values({
        id: USER_ADMIN_ID,
        email: 'file-admin@idmis.gov.ng',
        fullName: 'File Admin',
        passwordHash,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();

    await testDb
      .insert(role)
      .values({
        id: ROLE_SYSTEM_ADMIN_ID,
        key: 'system_admin',
        name: 'System Admin',
        isSystem: true,
      })
      .onConflictDoNothing();

    await testDb
      .insert(rolePermission)
      .values([
        { roleId: ROLE_SYSTEM_ADMIN_ID, permission: permissions.CORE_FILE_UPLOAD },
        { roleId: ROLE_SYSTEM_ADMIN_ID, permission: permissions.CORE_FILE_READ },
      ])
      .onConflictDoNothing();

    await testDb.insert(assignment).values({
      id: crypto.randomUUID(),
      userId: USER_ADMIN_ID,
      roleId: ROLE_SYSTEM_ADMIN_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Generate JWT token
    const sid = crypto.randomUUID();
    await testDb.insert(session).values({
      id: sid,
      familyId: crypto.randomUUID(),
      userId: USER_ADMIN_ID,
      refreshTokenHash: 'dummy',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const { accessToken } = await tokenService.createAccessToken(USER_ADMIN_ID, sid);
    adminToken = accessToken;
  });

  afterAll(async () => {
    resetAuditWriter();
    if (app) await app.close();
    if (testClient) await testClient.end();
    if (adminClient) {
      try {
        await adminClient.unsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();`,
        );
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      } catch {
        // ignore drop error
      }
      await adminClient.end();
    }
  });

  describe('1. Upload Initiation (UUID-only keys & Multipart threshold)', () => {
    it('POST /files/upload/initiate: returns single-part URL with strictly UUID-only storage key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/files/upload/initiate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileName: '../../malicious/path/document.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024 * 1024, // 1MB
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.fileId).toBeDefined();
      expect(body.isMultipart).toBe(false);
      expect(body.uploadUrl).toBeDefined();
      expect(body.parts).toBeUndefined();

      // Enforce strict UUID-only storage key: files/${uuid}
      expect(body.storageKey).toMatch(
        /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(body.storageKey).not.toContain('malicious');
    });

    it('POST /files/upload/initiate: initiates multipart for files exceeding threshold (>10MB)', async () => {
      vi.spyOn(storageService, 'initiateMultipartUpload').mockResolvedValueOnce('upload_12345');
      vi.spyOn(storageService, 'getMultipartUploadPartUrls').mockResolvedValueOnce([
        { partNumber: 1, uploadUrl: 'http://localhost:9000/part1' },
        { partNumber: 2, uploadUrl: 'http://localhost:9000/part2' },
        { partNumber: 3, uploadUrl: 'http://localhost:9000/part3' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/files/upload/initiate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileName: 'large_dataset.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 15 * 1024 * 1024, // 15MB
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.isMultipart).toBe(true);
      expect(body.uploadId).toBe('upload_12345');
      expect(body.parts).toBeDefined();
      expect(body.parts.length).toBe(3); // 15MB / 5MB = 3 parts
      expect(body.partSizeBytes).toBe(5 * 1024 * 1024);
    });
  });

  describe('2. Upload Completion, Sniffing & Antivirus Verification', () => {
    it('POST /files/upload/complete: completes clean upload, verifies sha256 and outbox events', async () => {
      // 1. Initiate
      const initRes = await app.inject({
        method: 'POST',
        url: '/files/upload/initiate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      });
      const { fileId } = JSON.parse(initRes.body);

      // Mock S3 GetObject stream with valid PDF magic bytes
      const validPdf = Buffer.from('%PDF-1.7 Test PDF content for IDMIS verification');
      const sha256 = crypto.createHash('sha256').update(validPdf).digest('hex');

      vi.spyOn(storageService.getClient(), 'send').mockImplementation((async (cmd: unknown) => {
        if ((cmd as { constructor: { name: string } }).constructor.name === 'GetObjectCommand') {
          return { Body: Readable.from([validPdf]) };
        }
        return {};
      }) as never);

      // 2. Complete
      const compRes = await app.inject({
        method: 'POST',
        url: '/files/upload/complete',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileId,
          sha256,
        },
      });

      if (compRes.statusCode !== 201) {
        console.error('completeUpload failed with:', compRes.body);
      }
      expect(compRes.statusCode).toBe(201);
      const completed = JSON.parse(compRes.body);
      expect(completed.id).toBe(fileId);
      expect(completed.scanStatus).toBe('clean');
      expect(completed.sha256).toBe(sha256);

      // Verify outbox events emitted
      const events = await testDb.select().from(outboxEvent);
      const uploadEvt = events.find(
        (e) => e.eventType === 'core.file.uploaded' && e.aggregateId === fileId,
      );
      const scanEvt = events.find(
        (e) => e.eventType === 'core.file.scanned' && e.aggregateId === fileId,
      );
      expect(uploadEvt).toBeDefined();
      expect(scanEvt).toBeDefined();

      // Verify audit log row created
      const auditRows = await testDb.select().from(auditLog);
      const fileAudit = auditRows.find(
        (a) => a.entityType === 'core.file' && a.entityId === fileId,
      );
      expect(fileAudit).toBeDefined();
    });

    it('POST /files/upload/complete: rejects file with 422 if sniffed magic bytes do not match declared MIME type', async () => {
      // 1. Initiate declaring PDF
      const initRes = await app.inject({
        method: 'POST',
        url: '/files/upload/initiate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileName: 'fake.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 200,
        },
      });
      const { fileId } = JSON.parse(initRes.body);

      // Mock S3 GetObject returning Windows executable (MZ header)
      const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

      vi.spyOn(storageService.getClient(), 'send').mockImplementation((async (cmd: unknown) => {
        if ((cmd as { constructor: { name: string } }).constructor.name === 'GetObjectCommand') {
          return { Body: Readable.from([fakeExe]) };
        }
        return {};
      }) as never);

      const compRes = await app.inject({
        method: 'POST',
        url: '/files/upload/complete',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { fileId },
      });

      expect(compRes.statusCode).toBe(422);
      const err = JSON.parse(compRes.body);
      expect(err.detail).toContain('magic bytes do not match declared MIME type');
    });

    it('POST /files/upload/complete: marks file as infected when EICAR signature is detected', async () => {
      const initRes = await app.inject({
        method: 'POST',
        url: '/files/upload/initiate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          fileName: 'virus.txt',
          mimeType: 'text/plain',
          sizeBytes: 68,
        },
      });
      const { fileId } = JSON.parse(initRes.body);

      const eicarPayload = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );

      vi.spyOn(storageService.getClient(), 'send').mockImplementation((async (cmd: unknown) => {
        if ((cmd as { constructor: { name: string } }).constructor.name === 'GetObjectCommand') {
          return { Body: Readable.from([eicarPayload]) };
        }
        return {};
      }) as never);

      const compRes = await app.inject({
        method: 'POST',
        url: '/files/upload/complete',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { fileId },
      });

      expect(compRes.statusCode).toBe(201);
      const fileData = JSON.parse(compRes.body);
      expect(fileData.scanStatus).toBe('infected');
    });
  });

  describe('3. File Download & Deletion', () => {
    it('GET /files/:id/download: generates presigned download URL for clean file', async () => {
      const [cleanFile] = await testDb
        .insert(file)
        .values({
          id: crypto.randomUUID(),
          storageKey: `files/${crypto.randomUUID()}`,
          originalName: 'clean_doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256: 'd'.repeat(64),
          scanStatus: 'clean',
          createdBy: USER_ADMIN_ID,
          updatedBy: USER_ADMIN_ID,
        })
        .returning();

      const res = await app.inject({
        method: 'GET',
        url: `/files/${cleanFile.id}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.downloadUrl).toBeDefined();
      expect(body.downloadUrl).toContain(cleanFile.storageKey);
      expect(body.expiresInSeconds).toBe(300);
    });

    it('GET /files/:id/download: refuses download with 403 Forbidden for infected file', async () => {
      const [infectedFile] = await testDb
        .insert(file)
        .values({
          id: crypto.randomUUID(),
          storageKey: `files/${crypto.randomUUID()}`,
          originalName: 'virus.exe',
          mimeType: 'text/plain',
          sizeBytes: 100,
          sha256: 'e'.repeat(64),
          scanStatus: 'infected',
          createdBy: USER_ADMIN_ID,
          updatedBy: USER_ADMIN_ID,
        })
        .returning();

      const res = await app.inject({
        method: 'GET',
        url: `/files/${infectedFile.id}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('DELETE /files/:id: soft deletes file and emits core.file.deleted outbox event', async () => {
      vi.spyOn(storageService, 'deleteObject').mockResolvedValueOnce();

      const [toDelete] = await testDb
        .insert(file)
        .values({
          id: crypto.randomUUID(),
          storageKey: `files/${crypto.randomUUID()}`,
          originalName: 'delete_me.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 500,
          sha256: 'f'.repeat(64),
          scanStatus: 'clean',
          createdBy: USER_ADMIN_ID,
          updatedBy: USER_ADMIN_ID,
        })
        .returning();

      const res = await app.inject({
        method: 'DELETE',
        url: `/files/${toDelete.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify soft deleted
      const [fetched] = await testDb.select().from(file).where(schema.eq(file.id, toDelete.id));
      expect(fetched.deletedAt).not.toBeNull();

      // Verify outbox event emitted
      const events = await testDb.select().from(outboxEvent);
      const deleteEvt = events.find(
        (e) => e.eventType === 'core.file.deleted' && e.aggregateId === toDelete.id,
      );
      expect(deleteEvt).toBeDefined();
    });
  });
});
