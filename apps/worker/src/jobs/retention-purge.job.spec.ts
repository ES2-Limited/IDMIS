import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as crypto from 'node:crypto';
import path from 'node:path';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { postgres, drizzle, migrate, setDatabaseUrl, SYSTEM_USER_ID } from '@idmis/db';
import * as schema from '@idmis/db';
import { runRetentionPurgeJob } from './retention-purge.job';

describe('Data Retention & Purge Worker Job (BE-5.3)', () => {
  const TEST_DB_NAME = `idmis_test_retention_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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

  const mockDeletedS3Keys: string[] = [];
  const mockS3Client = {
    send: (cmd: unknown) => {
      if (cmd instanceof DeleteObjectCommand) {
        mockDeletedS3Keys.push(cmd.input.Key as string);
        return Promise.resolve({});
      }
      return Promise.resolve({});
    },
  } as unknown as S3Client;

  const testStateId = crypto.randomUUID();
  const testSchemeId = crypto.randomUUID();
  const testDocTypeId = crypto.randomUUID();

  // Test entities IDs
  const syncOpOldId = crypto.randomUUID();
  const syncOpNewId = crypto.randomUUID();

  const fileOldId = crypto.randomUUID();
  const fileNewId = crypto.randomUUID();
  const batchOldId = crypto.randomUUID();
  const batchNewId = crypto.randomUUID();

  const eventOldId = crypto.randomUUID();
  const eventNewId = crypto.randomUUID();

  const farmerOldId = crypto.randomUUID();
  const farmerNewId = crypto.randomUUID();
  const identityOldId = crypto.randomUUID();
  const identityNewId = crypto.randomUUID();

  const farmOldId = crypto.randomUUID();
  const farmNewId = crypto.randomUUID();
  const plotOldId = crypto.randomUUID();
  const plotNewId = crypto.randomUUID();

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    const migrationsFolder = path.resolve(__dirname, '../../../../packages/db/migrations');
    await migrate(testDb, { migrationsFolder });
    setDatabaseUrl(testDbUrl);

    // 1. Seed base fixtures
    await testClient`
      INSERT INTO "core"."app_user" ("id", "email", "username", "full_name", "password_hash", "is_active", "must_change_password")
      VALUES (${SYSTEM_USER_ID}, 'system@idmis.internal', 'system', 'System User', '*', false, false)
      ON CONFLICT DO NOTHING;
    `;

    await testClient`
      INSERT INTO "core"."state" ("id", "code", "name", "created_by", "updated_by")
      VALUES (${testStateId}, 'KN', 'Kano', ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID})
      ON CONFLICT DO NOTHING;
    `;

    await testClient`
      INSERT INTO "core"."organisation" ("id", "name", "code", "type", "created_by", "updated_by")
      VALUES (${testSchemeId}, 'Hadejia Scheme', 'HVS', 'scheme', ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID})
      ON CONFLICT DO NOTHING;
    `;

    const lookupTypeId = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."lookup_type" ("id", "key", "name", "module", "is_system")
      VALUES (${lookupTypeId}, 'identity_document_type', 'Identity Document Type', 'core', true)
      ON CONFLICT DO NOTHING;
    `;

    await testClient`
      INSERT INTO "core"."lookup_value" ("id", "lookup_type_id", "code", "label", "sort_order", "is_active")
      VALUES (${testDocTypeId}, ${lookupTypeId}, 'nin', 'National Identification Number (NIN)', 1, true)
      ON CONFLICT DO NOTHING;
    `;

    // 2. Seed Sync Queue: 1 older than 30 days (40 days), 1 newer (10 days)
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const deviceId = crypto.randomUUID();
    const installationId = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."device" ("id", "installation_id", "user_id")
      VALUES (${deviceId}, ${installationId}, ${SYSTEM_USER_ID});
    `;

    await testClient`
      INSERT INTO "core"."sync_op" ("op_id", "device_id", "entity", "record_id", "outcome", "received_at")
      VALUES
        (${syncOpOldId}, ${deviceId}, 'farmer', ${crypto.randomUUID()}, 'applied', ${fortyDaysAgo}::timestamptz),
        (${syncOpNewId}, ${deviceId}, 'farmer', ${crypto.randomUUID()}, 'applied', ${tenDaysAgo}::timestamptz);
    `;

    // 3. Seed Import Batches: 1 older than 90 days (100 days), 1 newer (15 days)
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

    await testClient`
      INSERT INTO "core"."file" ("id", "storage_key", "original_name", "mime_type", "size_bytes", "sha256", "scan_status", "created_by", "updated_by")
      VALUES
        (${fileOldId}, 'imports/old-batch.xlsx', 'old-batch.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1024, 'sha1', 'clean', ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID}),
        (${fileNewId}, 'imports/new-batch.xlsx', 'new-batch.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 2048, 'sha2', 'clean', ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID});
    `;

    await testClient`
      INSERT INTO "core"."import_batch" ("id", "dataset", "file_id", "status", "created_by", "created_at")
      VALUES
        (${batchOldId}, 'wua', ${fileOldId}, 'committed', ${SYSTEM_USER_ID}, ${hundredDaysAgo}::timestamptz),
        (${batchNewId}, 'wua', ${fileNewId}, 'committed', ${SYSTEM_USER_ID}, ${fifteenDaysAgo}::timestamptz);
    `;

    // 4. Seed Outbox Events: 1 published > 14 days (20 days), 1 newer (5 days)
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    await testClient`
      INSERT INTO "core"."outbox_event" ("id", "event_type", "aggregate_type", "aggregate_id", "payload", "occurred_at", "delivered_at")
      VALUES
        (${eventOldId}, 'core.file.uploaded', 'file', ${fileOldId}, '{"fileId":"old"}'::jsonb, ${twentyDaysAgo}::timestamptz, ${twentyDaysAgo}::timestamptz),
        (${eventNewId}, 'core.file.uploaded', 'file', ${fileNewId}, '{"fileId":"new"}'::jsonb, ${fiveDaysAgo}::timestamptz, ${fiveDaysAgo}::timestamptz);
    `;

    // 5. Seed Soft-deleted entities: deleted > 365 days (400 days), deleted < 365 days (50 days)
    const fourHundredDaysAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();

    await testClient`
      INSERT INTO "slis"."farmer" ("id", "scheme_id", "state_id", "farmer_code", "first_name", "last_name", "gender", "birth_year", "phone", "anonymised", "deleted_at", "created_by", "updated_by")
      VALUES
        (${farmerOldId}, ${testSchemeId}, ${testStateId}, 'FC-OLD', 'Fatima', 'Bello', 'female', 1985, '08011112222', false, ${fourHundredDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID}),
        (${farmerNewId}, ${testSchemeId}, ${testStateId}, 'FC-NEW', 'Aliyu', 'Garba', 'male', 1990, '08033334444', false, ${fiftyDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID});
    `;

    await testClient`
      INSERT INTO "slis"."farmer_identity" ("id", "farmer_id", "document_type_id", "number_enc", "number_hash", "number_last4", "unique_per_person", "created_by", "updated_by")
      VALUES
        (${identityOldId}, ${farmerOldId}, ${testDocTypeId}, 'enc-nin-old', 'hash-nin-old', '1234', true, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID}),
        (${identityNewId}, ${farmerNewId}, ${testDocTypeId}, 'enc-nin-new', 'hash-nin-new', '5678', true, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID});
    `;

    const sectorId = crypto.randomUUID();
    await testClient`
      INSERT INTO "core"."organisation" ("id", "name", "code", "type", "created_by", "updated_by")
      VALUES (${sectorId}, 'Sector A', 'SEC-A', 'sector', ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID})
      ON CONFLICT DO NOTHING;
    `;

    await testClient`
      INSERT INTO "slis"."farm" ("id", "scheme_id", "sector_id", "name", "anonymised", "deleted_at", "created_by", "updated_by")
      VALUES
        (${farmOldId}, ${testSchemeId}, ${sectorId}, 'Farm Old', false, ${fourHundredDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID}),
        (${farmNewId}, ${testSchemeId}, ${sectorId}, 'Farm New', false, ${fiftyDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID});
    `;

    await testClient`
      INSERT INTO "slis"."plot" ("id", "scheme_id", "sector_id", "plot_code", "anonymised", "deleted_at", "created_by", "updated_by")
      VALUES
        (${plotOldId}, ${testSchemeId}, ${sectorId}, 'PLT-OLD', false, ${fourHundredDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID}),
        (${plotNewId}, ${testSchemeId}, ${sectorId}, 'PLT-NEW', false, ${fiftyDaysAgo}::timestamptz, ${SYSTEM_USER_ID}, ${SYSTEM_USER_ID});
    `;
  }, 30000);

  afterAll(async () => {
    if (testClient) await testClient.end({ timeout: 5 });
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end({ timeout: 5 });
    }
  });

  it('Dry-Run Mode: counts matching rows without modifying data and records audit log', async () => {
    const result = await runRetentionPurgeJob({
      dryRun: true,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.dryRun).toBe(true);
    expect(result.counts.syncQueue).toBe(1);
    expect(result.counts.importBatches).toBe(1);
    expect(result.counts.outboxEvents).toBe(1);
    expect(result.counts.farmers).toBe(1);
    expect(result.counts.farms).toBe(1);
    expect(result.counts.plots).toBe(1);

    // Verify rows are UNCHANGED
    const [oldSync] =
      await testClient`SELECT op_id FROM "core"."sync_op" WHERE op_id = ${syncOpOldId}`;
    expect(oldSync).toBeDefined();

    const [oldBatch] =
      await testClient`SELECT status FROM "core"."import_batch" WHERE id = ${batchOldId}`;
    expect(oldBatch.status).toBe('committed');

    const [oldEvent] =
      await testClient`SELECT id FROM "core"."outbox_event" WHERE id = ${eventOldId}`;
    expect(oldEvent).toBeDefined();

    const [oldFarmer] =
      await testClient`SELECT phone, first_name, anonymised FROM "slis"."farmer" WHERE id = ${farmerOldId}`;
    expect(oldFarmer.anonymised).toBe(false);
    expect(oldFarmer.phone).toBe('08011112222');

    const [oldIdentity] =
      await testClient`SELECT number_enc FROM "slis"."farmer_identity" WHERE id = ${identityOldId}`;
    expect(oldIdentity.number_enc).toBe('enc-nin-old');

    expect(mockDeletedS3Keys).toHaveLength(0);

    // Verify audit log has dry_run action
    const [audit] = await testClient`
      SELECT action, changes FROM "core"."audit_log"
      WHERE action = 'retention.dry_run'
      ORDER BY occurred_at DESC LIMIT 1
    `;
    expect(audit).toBeDefined();
    expect(audit.changes.after.dryRun).toBe(true);
    expect(audit.changes.after.counts.farmers).toBe(1);
  });

  it('Live Run Mode: purges older rows, anonymises identity, leaves newer data untouched, and records audit log', async () => {
    const result = await runRetentionPurgeJob({
      dryRun: false,
      s3Client: mockS3Client,
      bucket: 'test-bucket',
    });

    expect(result.dryRun).toBe(false);
    expect(result.counts.syncQueue).toBe(1);
    expect(result.counts.importBatches).toBe(1);
    expect(result.counts.outboxEvents).toBe(1);
    expect(result.counts.farmers).toBe(1);
    expect(result.counts.farms).toBe(1);
    expect(result.counts.plots).toBe(1);

    // 1. Sync Queue: old purged, new untouched
    const [oldSync] =
      await testClient`SELECT op_id FROM "core"."sync_op" WHERE op_id = ${syncOpOldId}`;
    expect(oldSync).toBeUndefined();

    const [newSync] =
      await testClient`SELECT op_id FROM "core"."sync_op" WHERE op_id = ${syncOpNewId}`;
    expect(newSync).toBeDefined();

    // 2. Import Batches: old marked archived + S3 file deleted, new untouched
    const [oldBatch] =
      await testClient`SELECT status FROM "core"."import_batch" WHERE id = ${batchOldId}`;
    expect(oldBatch.status).toBe('archived');
    expect(mockDeletedS3Keys).toContain('imports/old-batch.xlsx');

    const [newBatch] =
      await testClient`SELECT status FROM "core"."import_batch" WHERE id = ${batchNewId}`;
    expect(newBatch.status).toBe('committed');

    // 3. Outbox Events: old deleted, new untouched
    const [oldEvent] =
      await testClient`SELECT id FROM "core"."outbox_event" WHERE id = ${eventOldId}`;
    expect(oldEvent).toBeUndefined();

    const [newEvent] =
      await testClient`SELECT id FROM "core"."outbox_event" WHERE id = ${eventNewId}`;
    expect(newEvent).toBeDefined();

    // 4. Soft-deleted entities:
    // Farmer old: anonymised=true, phone=null, names anonymised, identity hashes/enc wiped, demographic data preserved
    const [oldFarmer] = await testClient`
      SELECT anonymised, phone, first_name, last_name, gender, birth_year
      FROM "slis"."farmer" WHERE id = ${farmerOldId}
    `;
    expect(oldFarmer.anonymised).toBe(true);
    expect(oldFarmer.phone).toBeNull();
    expect(oldFarmer.first_name).toBe('ANONYMISED');
    expect(oldFarmer.last_name).toBe('FARMER');
    // Demographic data intact for stats
    expect(oldFarmer.gender).toBe('female');
    expect(oldFarmer.birth_year).toBe(1985);

    // Identity old: NIN/BVN hashes and enc set to NULL
    const [oldIdentity] = await testClient`
      SELECT number_enc, number_hash, number_last4
      FROM "slis"."farmer_identity" WHERE id = ${identityOldId}
    `;
    expect(oldIdentity.number_enc).toBeNull();
    expect(oldIdentity.number_hash).toBeNull();
    expect(oldIdentity.number_last4).toBeNull();

    // Farmer new & identity new: untouched
    const [newFarmer] = await testClient`
      SELECT anonymised, phone, first_name
      FROM "slis"."farmer" WHERE id = ${farmerNewId}
    `;
    expect(newFarmer.anonymised).toBe(false);
    expect(newFarmer.phone).toBe('08033334444');
    expect(newFarmer.first_name).toBe('Aliyu');

    const [newIdentity] = await testClient`
      SELECT number_enc FROM "slis"."farmer_identity" WHERE id = ${identityNewId}
    `;
    expect(newIdentity.number_enc).toBe('enc-nin-new');

    // Farm & Plot old: marked anonymised=true
    const [oldFarm] =
      await testClient`SELECT anonymised FROM "slis"."farm" WHERE id = ${farmOldId}`;
    expect(oldFarm.anonymised).toBe(true);

    const [newFarm] =
      await testClient`SELECT anonymised FROM "slis"."farm" WHERE id = ${farmNewId}`;
    expect(newFarm.anonymised).toBe(false);

    const [oldPlot] =
      await testClient`SELECT anonymised FROM "slis"."plot" WHERE id = ${plotOldId}`;
    expect(oldPlot.anonymised).toBe(true);

    const [newPlot] =
      await testClient`SELECT anonymised FROM "slis"."plot" WHERE id = ${plotNewId}`;
    expect(newPlot.anonymised).toBe(false);

    // 5. Audit row recorded
    const [audit] = await testClient`
      SELECT action, changes FROM "core"."audit_log"
      WHERE action = 'retention.purge'
      ORDER BY occurred_at DESC LIMIT 1
    `;
    expect(audit).toBeDefined();
    expect(audit.changes.after.dryRun).toBe(false);
    expect(audit.changes.after.counts.farmers).toBe(1);
    expect(audit.changes.after.counts.syncQueue).toBe(1);
    expect(audit.changes.after.counts.importBatches).toBe(1);
    expect(audit.changes.after.counts.outboxEvents).toBe(1);
  });
});
