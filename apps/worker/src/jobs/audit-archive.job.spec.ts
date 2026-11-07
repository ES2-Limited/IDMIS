import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import path from 'node:path';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { postgres, drizzle, migrate, setDatabaseUrl, SYSTEM_USER_ID } from '@idmis/db';
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
    if (testClient) await testClient.end({ timeout: 5 });
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}";`);
      await adminClient.end({ timeout: 5 });
    }
  });

  it('exports 2025 rows to gzip in S3, verifies checksum, deletes 2025 rows, and leaves 2026 rows untouched', async () => {
    // 1. Insert 2 rows in 2025
    const id2025_1 = crypto.randomUUID();
    const id2025_2 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES
        (${id2025_1}, 'user', 'create', 'core.test', '1', '{"name":"row1"}'::jsonb, '2025-03-10T12:00:00.000Z'::timestamptz),
        (${id2025_2}, 'user', 'update', 'core.test', '1', '{"name":"row2"}'::jsonb, '2025-08-20T15:30:00.000Z'::timestamptz);
    `;

    // 2. Insert 1 row in 2026
    const id2026_1 = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."audit_log" ("id", "actor_type", "action", "entity_type", "entity_id", "changes", "occurred_at")
      VALUES
        (${id2026_1}, 'user', 'create', 'core.test', '2', '{"name":"row2026"}'::jsonb, '2026-02-14T09:00:00.000Z'::timestamptz);
    `;

    // 3. Mock S3 storage
    const s3Storage = new Map<string, Buffer>();
    const mockS3Client = {
      send: async (command: unknown) => {
        if (command instanceof PutObjectCommand) {
          const input = command.input;
          s3Storage.set(input.Key!, input.Body as Buffer);
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const key = command.input.Key!;
          const buf = s3Storage.get(key);
          if (!buf) throw new Error(`Not found: ${key}`);
          return {
            Body: Readable.from([buf]),
          };
        }
        return {};
      },
    } as unknown as S3Client;

    // 4. Run archive job targeting 2025
    const result = await runAuditArchiveJob({
      targetYear: 2025,
      migrationDatabaseUrl: testDbUrl,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('archived');
    expect(result.targetYear).toBe(2025);
    expect(result.rowCount).toBe(2);
    expect(result.purgedCount).toBe(2);
    expect(result.storageKey).toBe('audit-archives/2025.json.gz');
    expect(result.sha256).toBeDefined();

    // 5. Verify S3 storage object
    const storedGzip = s3Storage.get('audit-archives/2025.json.gz');
    expect(storedGzip).toBeDefined();
    const decompressed = zlib.gunzipSync(storedGzip!).toString('utf-8');
    const rows = decompressed
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.id === id2025_1)).toBe(true);
    expect(rows.some((r) => r.id === id2025_2)).toBe(true);

    // 6. Verify database rows: 2025 rows deleted, 2026 row UNTOUCHED
    const remaining2025 = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id IN (${id2025_1}, ${id2025_2});
    `;
    expect(remaining2025).toHaveLength(0);

    const remaining2026 = await testClient`
      SELECT id FROM "core"."audit_log" WHERE id = ${id2026_1};
    `;
    expect(remaining2026).toHaveLength(1);

    // 7. Verify audit log entry for the archive execution itself
    const [archiveAudit] = await testClient`
      SELECT * FROM "core"."audit_log" WHERE "action" = 'audit.archived' AND "entity_id" = '2025';
    `;
    expect(archiveAudit).toBeDefined();
    const changes =
      typeof archiveAudit.changes === 'string'
        ? JSON.parse(archiveAudit.changes)
        : archiveAudit.changes;
    const after = changes?.after ?? changes;
    expect(after.rowCount).toBe(2);
    expect(after.deletedCount).toBe(2);
  });
});
