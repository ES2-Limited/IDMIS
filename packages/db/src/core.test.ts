import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';
import { appUser, role, assignment, state, organisation, wua, wuaOfficer } from './schema';
import { SYSTEM_USER_ID } from './constants';
import { eq } from 'drizzle-orm';

describe('core schema and database integrity (fresh database per test run)', () => {
  const TEST_DB_NAME = `idmis_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/postgres';

  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let testClient: postgres.Sql;
  let testDb: ReturnType<typeof drizzle<typeof schema>>;

  const TEST_USER_ID = '018f3a5e-9999-7000-8000-000000000001';
  const TEST_ROLE_ID = '018f3a5e-9999-7000-8000-000000000002';
  const TEST_STATE_ID = '018f3a5e-9999-7000-8000-000000000003';
  const TEST_ORG_ID = '018f3a5e-9999-7000-8000-000000000004';
  const TEST_WUA_ID = '018f3a5e-9999-7000-8000-000000000005';

  beforeAll(async () => {
    // 1. Create a fresh, isolated database (no extensions pre-created)
    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    // 2. Connect to the fresh database
    testClient = postgres(testDbUrl);
    testDb = drizzle(testClient, { schema });

    // 3. Apply all migrations in order (0000_extensions -> 0001_schema -> 0002_triggers)
    const migrationsFolder = path.resolve(__dirname, '../migrations');
    await migrate(testDb, { migrationsFolder });

    // 4. Seed system user prerequisite
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
  });

  afterAll(async () => {
    // Teardown: ensure temporary database is dropped even if tests fail
    try {
      if (testClient) {
        await testClient.end({ timeout: 5 }).catch(() => {});
      }
    } finally {
      if (adminClient) {
        try {
          await adminClient
            .unsafe(
              `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();
          `,
            )
            .catch(() => {});
          await adminClient.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE);`);
        } catch (err) {
          console.error(`Failed to drop test database ${TEST_DB_NAME}:`, err);
        } finally {
          await adminClient.end({ timeout: 5 }).catch(() => {});
        }
      }
    }
  });

  it('proves the version trigger increments version and updates updated_at on row update', async () => {
    // 1. Insert test user with version = 1
    await testDb.insert(appUser).values({
      id: TEST_USER_ID,
      email: 'trigger-test@idmis.gov.ng',
      username: 'triggertest',
      fullName: 'Initial Name',
      passwordHash: 'dummyhash',
      version: 1,
      mustChangePassword: false,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    const initial = await testDb.query.appUser.findFirst({
      where: eq(appUser.id, TEST_USER_ID),
    });
    expect(initial?.version).toBe(1);
    const initialUpdatedAt = initial?.updatedAt;

    // Small delay to ensure timestamp bump
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Update test user
    await testDb
      .update(appUser)
      .set({ fullName: 'Updated Name' })
      .where(eq(appUser.id, TEST_USER_ID));

    const updated = await testDb.query.appUser.findFirst({
      where: eq(appUser.id, TEST_USER_ID),
    });

    expect(updated?.version).toBe(2);
    expect(updated?.fullName).toBe('Updated Name');
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initialUpdatedAt!).getTime(),
    );
  });

  it('proves assignment scope check rejects invalid combinations and accepts valid combinations', async () => {
    // Setup prerequisite records
    await testDb.insert(role).values({
      id: TEST_ROLE_ID,
      key: 'test_scope_role',
      name: 'Test Scope Role',
    });

    await testDb.insert(state).values({
      id: TEST_STATE_ID,
      code: 'TS',
      name: 'Test Scope State',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    await testDb.insert(organisation).values({
      id: TEST_ORG_ID,
      type: 'scheme',
      code: 'SCH-SCOPE-01',
      name: 'Scope Scheme Org',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 1. Valid: national scope (no scopeStateId, no scopeOrgId)
    const nationalValid = await testDb.insert(assignment).values({
      id: '018f3a5e-9999-7000-8000-000000000010',
      userId: TEST_USER_ID,
      roleId: TEST_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(nationalValid).toBeDefined();

    // 2. Invalid: national scope with scopeStateId
    await expect(
      testDb.insert(assignment).values({
        id: '018f3a5e-9999-7000-8000-000000000011',
        userId: TEST_USER_ID,
        roleId: TEST_ROLE_ID,
        module: 'core',
        scopeType: 'national',
        scopeStateId: TEST_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();

    // 3. Valid: state scope with scopeStateId
    const stateValid = await testDb.insert(assignment).values({
      id: '018f3a5e-9999-7000-8000-000000000012',
      userId: TEST_USER_ID,
      roleId: TEST_ROLE_ID,
      module: 'core',
      scopeType: 'state',
      scopeStateId: TEST_STATE_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(stateValid).toBeDefined();

    // 4. Invalid: state scope without scopeStateId
    await expect(
      testDb.insert(assignment).values({
        id: '018f3a5e-9999-7000-8000-000000000013',
        userId: TEST_USER_ID,
        roleId: TEST_ROLE_ID,
        module: 'core',
        scopeType: 'state',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();

    // 5. Valid: scheme scope with scopeOrgId
    const schemeValid = await testDb.insert(assignment).values({
      id: '018f3a5e-9999-7000-8000-000000000014',
      userId: TEST_USER_ID,
      roleId: TEST_ROLE_ID,
      module: 'slis',
      scopeType: 'scheme',
      scopeOrgId: TEST_ORG_ID,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(schemeValid).toBeDefined();

    // 6. Invalid: scheme scope with scopeStateId
    await expect(
      testDb.insert(assignment).values({
        id: '018f3a5e-9999-7000-8000-000000000015',
        userId: TEST_USER_ID,
        roleId: TEST_ROLE_ID,
        module: 'slis',
        scopeType: 'scheme',
        scopeStateId: TEST_STATE_ID,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();
  });

  it('proves date-range checks reject reversed dates on assignment and wua_officer', async () => {
    // Setup WUA record
    await testDb.insert(wua).values({
      id: TEST_WUA_ID,
      level: 'apex',
      organisationId: TEST_ORG_ID,
      name: 'Dates WUA',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 1. Assignment with valid dates (from <= to)
    const validAssignment = await testDb.insert(assignment).values({
      id: '018f3a5e-9999-7000-8000-000000000020',
      userId: TEST_USER_ID,
      roleId: TEST_ROLE_ID,
      module: 'core',
      scopeType: 'national',
      validFromOn: '2026-01-01',
      validToOn: '2026-12-31',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(validAssignment).toBeDefined();

    // 2. Assignment with reversed dates (from > to) must fail
    await expect(
      testDb.insert(assignment).values({
        id: '018f3a5e-9999-7000-8000-000000000021',
        userId: TEST_USER_ID,
        roleId: TEST_ROLE_ID,
        module: 'core',
        scopeType: 'national',
        validFromOn: '2026-12-31',
        validToOn: '2026-01-01',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();

    // 3. WUA Officer with valid dates (from <= to)
    const validOfficer = await testDb.insert(wuaOfficer).values({
      id: '018f3a5e-9999-7000-8000-000000000030',
      wuaId: TEST_WUA_ID,
      office: 'chair',
      fullName: 'Valid Officer',
      fromOn: '2026-01-01',
      toOn: '2026-12-31',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(validOfficer).toBeDefined();

    // 4. WUA Officer with reversed dates (from > to) must fail
    await expect(
      testDb.insert(wuaOfficer).values({
        id: '018f3a5e-9999-7000-8000-000000000031',
        wuaId: TEST_WUA_ID,
        office: 'chair',
        fullName: 'Reversed Officer',
        fromOn: '2026-12-31',
        toOn: '2026-01-01',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();
  });

  it("proves a soft-deleted organisation's code can be reused", async () => {
    const ORG_CODE = 'SCH-REUSE-001';
    const FIRST_ORG_ID = '018f3a5e-9999-7000-8000-000000000040';
    const SECOND_ORG_ID = '018f3a5e-9999-7000-8000-000000000041';

    // 1. Insert first active organisation
    await testDb.insert(organisation).values({
      id: FIRST_ORG_ID,
      type: 'scheme',
      code: ORG_CODE,
      name: 'First Active Scheme',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });

    // 2. Attempting to insert a second active organisation with the same code must fail
    await expect(
      testDb.insert(organisation).values({
        id: SECOND_ORG_ID,
        type: 'scheme',
        code: ORG_CODE,
        name: 'Second Active Scheme with Duplicate Code',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      }),
    ).rejects.toThrow();

    // 3. Soft-delete the first organisation
    await testDb
      .update(organisation)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(organisation.id, FIRST_ORG_ID));

    // 4. Now inserting a new active organisation with the same code must succeed!
    const reused = await testDb.insert(organisation).values({
      id: SECOND_ORG_ID,
      type: 'scheme',
      code: ORG_CODE,
      name: 'Second Scheme Reusing Deleted Code',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    });
    expect(reused).toBeDefined();
  });
});
