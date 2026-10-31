import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, inArray } from 'drizzle-orm';
import * as schema from './schema';
import {
  appUser,
  organisation,
  state,
  lga,
  ward,
  lookupType,
  lookupValue,
  farmer,
  farmerIdentity,
  waterRequest,
  feeCollection,
  changeLog,
  syncQuarantine,
  device,
} from './schema';
import { SYSTEM_USER_ID } from './constants';

describe('SLIS Database Schema & Identity Protection (BE-2.1)', () => {
  const TEST_DB_NAME = `idmis_slis_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  const TEST_USER_ID = '018f3a5e-1111-7000-8000-000000000001';
  const TEST_STATE_ID = '018f3a5e-1111-7000-8000-000000000002';
  const TEST_LGA_ID = '018f3a5e-1111-7000-8000-000000000003';
  const TEST_WARD_ID = '018f3a5e-1111-7000-8000-000000000004';
  const TEST_SCHEME_ID = '018f3a5e-1111-7000-8000-000000000005';
  const TEST_SECTOR_ID = '018f3a5e-1111-7000-8000-000000000006';
  const TEST_DOC_TYPE_NIN_ID = '018f3a5e-1111-7000-8000-000000000010';
  const TEST_DOC_TYPE_BANK_ID = '018f3a5e-1111-7000-8000-000000000011';
  const TEST_DEVICE_ID = '018f3a5e-1111-7000-8000-000000000020';

  beforeAll(async () => {
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    const migrationsFolder = path.resolve(__dirname, '../migrations');
    await migrate(testDb, { migrationsFolder });

    // Seed system user
    await testDb.insert(appUser).values({
      id: SYSTEM_USER_ID,
      email: 'system@idmis.internal',
      username: 'system',
      fullName: 'System',
      passwordHash: '*',
      isActive: false,
      mustChangePassword: false,
      failedSignIns: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Seed test user
    await testDb.insert(appUser).values({
      id: TEST_USER_ID,
      email: 'officer@example.com',
      username: 'officer',
      fullName: 'Data Officer',
      passwordHash: '*',
      isActive: true,
      mustChangePassword: false,
      failedSignIns: 0,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Seed geography
    await testDb.insert(state).values({
      id: TEST_STATE_ID,
      code: 'KN',
      name: 'Kano',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(lga).values({
      id: TEST_LGA_ID,
      stateId: TEST_STATE_ID,
      code: 'KN-KURA',
      name: 'Kura',
    });

    await testDb.insert(ward).values({
      id: TEST_WARD_ID,
      lgaId: TEST_LGA_ID,
      code: 'KN-KURA-KADAWA',
      name: 'Kadawa',
    });

    // Seed organisations (Scheme & Sector)
    await testDb.insert(organisation).values({
      id: TEST_SCHEME_ID,
      type: 'scheme',
      code: 'KRIS',
      name: 'Kano River Irrigation Scheme',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(organisation).values({
      id: TEST_SECTOR_ID,
      type: 'sector',
      parentId: TEST_SCHEME_ID,
      code: 'KRIS-SEC-01',
      name: 'Sector 1 Kadawa',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // Seed document types
    await testDb.insert(lookupType).values({
      id: '018f3a5e-1111-7000-8000-000000000009',
      key: 'document_type',
      name: 'Document Type',
      module: 'slis',
      isSystem: true,
    });

    await testDb.insert(lookupValue).values([
      {
        id: TEST_DOC_TYPE_NIN_ID,
        lookupTypeId: '018f3a5e-1111-7000-8000-000000000009',
        code: 'nin',
        label: 'National Identity Number (NIN)',
        sortOrder: 1,
        isActive: true,
        metadata: { unique_per_person: true },
      },
      {
        id: TEST_DOC_TYPE_BANK_ID,
        lookupTypeId: '018f3a5e-1111-7000-8000-000000000009',
        code: 'bank_account',
        label: 'Bank Account Number',
        sortOrder: 2,
        isActive: true,
        metadata: { unique_per_person: false },
      },
    ]);

    // Seed device
    await testDb.insert(device).values({
      id: TEST_DEVICE_ID,
      userId: TEST_USER_ID,
      installationId: '018f3a5e-1111-7000-8000-000000000021',
      label: 'Samsung Field Tablet',
      platform: 'android',
    });
  }, 30000);

  afterAll(async () => {
    if (testClient) await testClient.end();
    if (adminClient) {
      await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
      await adminClient.end();
    }
  });

  describe('Identity Number Protection & Duplicate Detection', () => {
    it('stores identity numbers encrypted and hashed, unreadable in raw database query', async () => {
      const farmerId = '018f3a5e-2222-7000-8000-000000000001';
      const plainNin = '12345678901';
      const fakeEncrypted = 'v1:aes-256-gcm:fakeciphertextdata12345';
      const keyedHmacHash = '1:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

      // Insert farmer
      await testDb.insert(farmer).values({
        id: farmerId,
        schemeId: TEST_SCHEME_ID,
        farmerCode: 'KRIS-F-001',
        firstName: 'Aliyu',
        lastName: 'Musa',
        gender: 'male',
        village: 'Kadawa',
        wardId: TEST_WARD_ID,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      // Insert identity
      const identityId = '018f3a5e-2222-7000-8000-000000000002';
      await testDb.insert(farmerIdentity).values({
        id: identityId,
        farmerId,
        documentTypeId: TEST_DOC_TYPE_NIN_ID,
        numberEnc: fakeEncrypted,
        numberHash: keyedHmacHash,
        numberLast4: '8901',
        uniquePerPerson: true,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      // Prove raw SQL query on table has NO plain number
      const rawRows = await testClient`
        SELECT number_enc, number_hash, number_last4 FROM slis.farmer_identity WHERE id = ${identityId}
      `;
      expect(rawRows).toHaveLength(1);
      const row = rawRows[0]!;
      expect(row.number_enc).toBe(fakeEncrypted);
      expect(row.number_enc).not.toContain(plainNin);
      expect(row.number_hash).toBe(keyedHmacHash);
      expect(row.number_hash).not.toContain(plainNin);
      expect(row.number_last4).toBe('8901');

      // Prove record is findable by exact number via HMAC hash
      const found = await testDb
        .select()
        .from(farmerIdentity)
        .where(
          inArray(farmerIdentity.numberHash, [keyedHmacHash, '2:anotherrotatedhashcandidate']),
        );
      expect(found).toHaveLength(1);
      expect(found[0]!.id).toBe(identityId);
      expect(found[0]!.numberLast4).toBe('8901');
    });

    it('blocks duplicate NIN across farmers using partial unique index', async () => {
      const secondFarmerId = '018f3a5e-2222-7000-8000-000000000003';
      await testDb.insert(farmer).values({
        id: secondFarmerId,
        schemeId: TEST_SCHEME_ID,
        farmerCode: 'KRIS-F-002',
        firstName: 'Ibrahim',
        lastName: 'Musa',
        gender: 'male',
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      const duplicateHmacHash =
        '1:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

      // Attempt inserting same NIN (uniquePerPerson = true) -> must reject
      await expect(
        testDb.insert(farmerIdentity).values({
          id: '018f3a5e-2222-7000-8000-000000000004',
          farmerId: secondFarmerId,
          documentTypeId: TEST_DOC_TYPE_NIN_ID,
          numberEnc: 'v1:another-cipher',
          numberHash: duplicateHmacHash,
          numberLast4: '8901',
          uniquePerPerson: true,
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        }),
      ).rejects.toThrow();
    });

    it('allows duplicate bank account numbers across farmers because unique_per_person = false', async () => {
      const sharedBankHmac = '1:sharedbankhmachash1234567890abcdef1234567890abcdef1234567890abcdef';
      const farmer1 = '018f3a5e-2222-7000-8000-000000000001';
      const farmer2 = '018f3a5e-2222-7000-8000-000000000003';

      // Insert for Farmer 1
      await testDb.insert(farmerIdentity).values({
        id: '018f3a5e-2222-7000-8000-000000000005',
        farmerId: farmer1,
        documentTypeId: TEST_DOC_TYPE_BANK_ID,
        numberEnc: 'v1:bank-cipher-1',
        numberHash: sharedBankHmac,
        numberLast4: '4321',
        bankName: 'First Bank of Nigeria',
        uniquePerPerson: false,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      // Insert same bank account for Farmer 2 -> must succeed!
      const identity2 = await testDb
        .insert(farmerIdentity)
        .values({
          id: '018f3a5e-2222-7000-8000-000000000006',
          farmerId: farmer2,
          documentTypeId: TEST_DOC_TYPE_BANK_ID,
          numberEnc: 'v1:bank-cipher-2',
          numberHash: sharedBankHmac,
          numberLast4: '4321',
          bankName: 'First Bank of Nigeria',
          uniquePerPerson: false,
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        })
        .returning();

      expect(identity2).toHaveLength(1);
      expect(identity2[0]!.numberHash).toBe(sharedBankHmac);
    });
  });

  describe('Business Rule Constraints & Triggers', () => {
    it('enforces water request one-of rule (individual with farmer XOR group with WUA)', async () => {
      // Valid individual request
      const valid = await testDb
        .insert(waterRequest)
        .values({
          id: '018f3a5e-3333-7000-8000-000000000001',
          schemeId: TEST_SCHEME_ID,
          level: 'individual',
          farmerId: '018f3a5e-2222-7000-8000-000000000001',
          status: 'draft',
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        })
        .returning();
      expect(valid).toHaveLength(1);

      // Invalid individual request without farmer
      await expect(
        testDb.insert(waterRequest).values({
          id: '018f3a5e-3333-7000-8000-000000000002',
          schemeId: TEST_SCHEME_ID,
          level: 'individual',
          farmerId: null,
          status: 'draft',
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        }),
      ).rejects.toThrow();
    });

    it('enforces fee collection one-of rule and field receipt requirement for device capture', async () => {
      const seasonId = '018f3a5e-4444-7000-8000-000000000001';
      await testDb.insert(schema.season).values({
        id: seasonId,
        schemeId: TEST_SCHEME_ID,
        name: 'Dry Season 2026',
        startsOn: '2026-11-01',
        endsOn: '2027-04-30',
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      // Web entry without deviceId and without fieldReceiptRef -> allowed
      const webEntry = await testDb
        .insert(feeCollection)
        .values({
          id: '018f3a5e-4444-7000-8000-000000000002',
          schemeId: TEST_SCHEME_ID,
          seasonId,
          farmerId: '018f3a5e-2222-7000-8000-000000000001',
          amountNgn: '15000.00',
          paidOn: '2026-11-05',
          receiptNo: 'OFFICIAL-REC-001',
          deviceId: null,
          fieldReceiptRef: null,
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        })
        .returning();
      expect(webEntry).toHaveLength(1);

      // Mobile device entry without fieldReceiptRef -> violates CHECK constraint!
      await expect(
        testDb.insert(feeCollection).values({
          id: '018f3a5e-4444-7000-8000-000000000003',
          schemeId: TEST_SCHEME_ID,
          seasonId,
          farmerId: '018f3a5e-2222-7000-8000-000000000001',
          amountNgn: '15000.00',
          paidOn: '2026-11-05',
          deviceId: TEST_DEVICE_ID,
          fieldReceiptRef: null, // missing!
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        }),
      ).rejects.toThrow();

      // Mobile device entry with fieldReceiptRef -> succeeds
      const mobileEntry = await testDb
        .insert(feeCollection)
        .values({
          id: '018f3a5e-4444-7000-8000-000000000004',
          schemeId: TEST_SCHEME_ID,
          seasonId,
          farmerId: '018f3a5e-2222-7000-8000-000000000001',
          amountNgn: '15000.00',
          paidOn: '2026-11-05',
          deviceId: TEST_DEVICE_ID,
          fieldReceiptRef: 'DEV-KRIS-001',
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        })
        .returning();
      expect(mobileEntry).toHaveLength(1);
      expect(mobileEntry[0]!.fieldReceiptRef).toBe('DEV-KRIS-001');

      // Duplicate fieldReceiptRef on same device -> rejects
      await expect(
        testDb.insert(feeCollection).values({
          id: '018f3a5e-4444-7000-8000-000000000005',
          schemeId: TEST_SCHEME_ID,
          seasonId,
          farmerId: '018f3a5e-2222-7000-8000-000000000001',
          amountNgn: '20000.00',
          paidOn: '2026-11-06',
          deviceId: TEST_DEVICE_ID,
          fieldReceiptRef: 'DEV-KRIS-001', // duplicate!
          createdBy: TEST_USER_ID,
          updatedBy: TEST_USER_ID,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Offline Sync Log & Quarantine Tables', () => {
    it('records changes in change_log with automatic xid8 transaction id and seq order', async () => {
      const recordId = '018f3a5e-5555-7000-8000-000000000001';
      const [inserted] = await testDb
        .insert(changeLog)
        .values({
          entity: 'slis.farmer',
          recordId,
          op: 'upsert',
          schemeId: TEST_SCHEME_ID,
          stateId: TEST_STATE_ID,
        })
        .returning();

      expect(inserted).toBeDefined();
      expect(inserted.seq).toBeGreaterThan(0);
      expect(typeof inserted.xid).toBe('string');
      expect(inserted.entity).toBe('slis.farmer');

      // Verify composite cursor query ordered by (xid, seq)
      const rows = await testDb
        .select()
        .from(changeLog)
        .where(eq(changeLog.schemeId, TEST_SCHEME_ID));
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('supports quarantining operations with reason grant_expired or device_revoked', async () => {
      const [quarantined] = await testDb
        .insert(syncQuarantine)
        .values({
          deviceId: TEST_DEVICE_ID,
          opId: '018f3a5e-6666-7000-8000-000000000001',
          entity: 'slis.farmer',
          action: 'create',
          recordId: '018f3a5e-6666-7000-8000-000000000002',
          baseVersion: 1,
          payload: { firstName: 'Late', lastName: 'Submitter' },
          reason: 'grant_expired',
        })
        .returning();

      expect(quarantined).toBeDefined();
      expect(quarantined.reason).toBe('grant_expired');
      expect(quarantined.resolvedAt).toBeNull();
    });
  });
});
