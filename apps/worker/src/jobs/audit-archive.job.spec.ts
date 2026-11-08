import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import path from 'node:path';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { postgres, drizzle, migrate, setDatabaseUrl, SYSTEM_USER_ID, setting, eq } from '@idmis/db';
import * as schema from '@idmis/db';
import { runAuditArchiveJob } from './audit-archive.job';

describe('Audit Archive Job Specification (BE-5.4)', () => {
  const TEST_DB_NAME = `idmis_test_audit_archive_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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
  let s3Storage: Map<string, Buffer>;
  let mockS3Client: S3Client;

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    const migrationsFolder = path.resolve(__dirname, '../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });
    setDatabaseUrl(testDbUrl);

    // Seed system user
    await testClient`
      INSERT INTO "core"."app_user" ("id", "email", "username", "full_name", "password_hash", "is_active", "must_change_password")
      VALUES (${SYSTEM_USER_ID}, 'system@idmis.internal', 'system', 'System User', '*', false, false)
      ON CONFLICT DO NOTHING;
    `;
  }, 30000);

  afterAll(async () => {
    try {
      if (testClient) await testClient.end({ timeout: 5 });
      if (adminClient) {
        await adminClient.unsafe(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();
        `);
        await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
        await adminClient.end({ timeout: 5 });
      }
    } catch {
      // ignore teardown errors
    }
  });

  beforeEach(async () => {
    // Reset setting and clear storage
    await testDb.delete(setting).where(eq(setting.key, 'audit_retention_months'));
    s3Storage = new Map<string, Buffer>();

    mockS3Client = {
      send: async (command: unknown) => {
        if (command instanceof PutObjectCommand) {
          const input = command.input;
          s3Storage.set(input.Key!, input.Body as Buffer);
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const key = command.input.Key!;
          const buf = s3Storage.get(key);
          if (!buf) {
            const err = new Error(`NoSuchKey: ${key}`);
            (err as unknown as { name: string }).name = 'NoSuchKey';
            throw err;
          }
          return {
            Body: Readable.from([buf]),
          };
        }
        return {};
      },
    } as unknown as S3Client;
  });

  it('targetYear run with the setting unset -> archive + checksum written, 0 rows deleted', async () => {
    const id2025_1 = crypto.randomUUID();
    const id2025_2 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES
        (${id2025_1}, 'user', 'create', 'core.test', '1', '{"name":"row1"}'::jsonb, '2025-03-10T12:00:00.000Z'::timestamptz),
        (${id2025_2}, 'user', 'update', 'core.test', '1', '{"name":"row2"}'::jsonb, '2025-08-20T15:30:00.000Z'::timestamptz);
    `;

    const result = await runAuditArchiveJob({
      targetYear: 2025,
      migrationDatabaseUrl: testDbUrl,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('archived');
    expect(result.targetYear).toBe(2025);
    expect(result.rowCount).toBe(2);
    expect(result.purgedCount).toBe(0);
    expect(result.storageKey).toBe('audit-archives/2025.json.gz');
    expect(result.sha256).toBeDefined();

    // Verify archive and checksum written in S3
    const archiveGz = s3Storage.get('audit-archives/2025.json.gz');
    expect(archiveGz).toBeDefined();
    const checksumTxt = s3Storage.get('audit-archives/2025.json.gz.sha256');
    expect(checksumTxt).toBeDefined();
    expect(checksumTxt!.toString('utf-8').trim()).toBe(result.sha256);

    const decompressed = zlib.gunzipSync(archiveGz!).toString('utf-8');
    const rows = decompressed
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);

    // Verify 0 rows deleted from database (both remain in DB)
    const remaining = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id IN (${id2025_1}, ${id2025_2});
    `;
    expect(remaining).toHaveLength(2);
  });

  it("setting = 36 months -> last year's rows are NOT deleted; rows older than 36 months that are in a verified archive ARE deleted", async () => {
    // 1. Configure retention setting = 36 months
    await testDb.insert(setting).values({
      id: crypto.randomUUID(),
      key: 'audit_retention_months',
      value: 36,
      module: 'core',
      isPublic: false,
    });

    const now = new Date('2026-11-01T00:00:00.000Z'); // 36 months cutoff = 2023-11-01

    // 2. Insert 2025 row (last year, < 36 months old)
    const id2025 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES (${id2025}, 'user', 'create', 'core.test', 'last_year', '{"name":"last_year"}'::jsonb, '2025-05-15T12:00:00.000Z'::timestamptz);
    `;

    // 3. Insert 2022 rows (> 36 months old)
    const id2022_1 = crypto.randomUUID();
    const id2022_2 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES
        (${id2022_1}, 'user', 'create', 'core.test', 'old_1', '{"name":"old1"}'::jsonb, '2022-04-10T10:00:00.000Z'::timestamptz),
        (${id2022_2}, 'user', 'update', 'core.test', 'old_2', '{"name":"old2"}'::jsonb, '2022-09-20T14:00:00.000Z'::timestamptz);
    `;

    // 4. Pre-create verified archive in S3 for 2022
    const rows2022 = [
      { id: id2022_1, occurred_at: '2022-04-10T10:00:00.000Z' },
      { id: id2022_2, occurred_at: '2022-09-20T14:00:00.000Z' },
    ];
    const ndjson2022 = rows2022.map((r) => JSON.stringify(r)).join('\n');
    const gzipped2022 = zlib.gzipSync(Buffer.from(ndjson2022, 'utf-8'));
    const sha256_2022 = crypto.createHash('sha256').update(gzipped2022).digest('hex');

    s3Storage.set('audit-archives/2022.json.gz', gzipped2022);
    s3Storage.set('audit-archives/2022.json.gz.sha256', Buffer.from(`${sha256_2022}\n`, 'utf-8'));

    // 5. Run automatic background audit archive
    const result = await runAuditArchiveJob({
      now,
      migrationDatabaseUrl: testDbUrl,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('purged');
    expect(result.retentionMonths).toBe(36);
    expect(result.purgedCount).toBe(2);

    // 6. Verify database: 2025 row NOT deleted, 2022 rows ARE deleted
    const remaining2025 = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id = ${id2025};
    `;
    expect(remaining2025).toHaveLength(1);

    const remaining2022 = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id IN (${id2022_1}, ${id2022_2});
    `;
    expect(remaining2022).toHaveLength(0);
  });

  it('rows older than the cutoff but NOT in a verified archive -> NOT deleted', async () => {
    // 1. Configure retention setting = 36 months
    await testDb.insert(setting).values({
      id: crypto.randomUUID(),
      key: 'audit_retention_months',
      value: 36,
      module: 'core',
      isPublic: false,
    });

    const now = new Date('2026-11-01T00:00:00.000Z');

    // 2. Insert row in 2020 (> 36 months old)
    const id2020 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES (${id2020}, 'user', 'create', 'core.test', 'unarchived', '{"name":"unarchived"}'::jsonb, '2020-02-10T12:00:00.000Z'::timestamptz);
    `;

    // 3. Storage has NO archive for 2020 (s3Storage is empty for 2020)
    expect(s3Storage.has('audit-archives/2020.json.gz')).toBe(false);

    // 4. Run automatic audit archive job
    const result = await runAuditArchiveJob({
      now,
      migrationDatabaseUrl: testDbUrl,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('purged');
    expect(result.purgedCount).toBe(0);

    // 5. Verify the 2020 row is NOT deleted
    const remaining2020 = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id = ${id2020};
    `;
    expect(remaining2020).toHaveLength(1);
  });

  it('automatic run with the setting unset -> skipped, 0 rows deleted', async () => {
    // 1. Setting is unset (verified by beforeEach)
    const idRow = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES (${idRow}, 'user', 'create', 'core.test', 'keep_forever', '{"name":"row"}'::jsonb, '2021-01-01T00:00:00.000Z'::timestamptz);
    `;

    // 2. Run automatic job without targetYear
    const result = await runAuditArchiveJob({
      migrationDatabaseUrl: testDbUrl,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('skipped');
    expect(result.retentionMonths).toBeNull();
    expect(result.purgedCount).toBe(0);
    expect(result.reason).toContain('keep forever');

    // 3. Verify row is NOT deleted
    const remaining = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id = ${idRow};
    `;
    expect(remaining).toHaveLength(1);
  });
});
