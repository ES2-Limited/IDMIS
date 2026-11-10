import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { seed } from './seed';
import { setDatabaseUrl } from './index';
import { appUser } from './schema';

describe('Seed Idempotency & Admin Password Protection (fix(db))', () => {
  const TEST_DB_NAME = `idmis_seed_admin_test_${Date.now()}`;
  const baseAdminUrl =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://idmis:idmis@localhost:5432/idmis';
  const testDbUrl = baseAdminUrl.replace(/\/[^/]+(?:\?.*)?$/, `/${TEST_DB_NAME}`);

  let adminClient: postgres.Sql;
  let sqlClient: postgres.Sql;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let testDb: any;

  const INITIAL_ADMIN_EMAIL = 'admin_initial@idmis.gov.ng';
  let initialPasswordHash: string;
  let changedPasswordHash: string;
  let deployPasswordHash: string;

  beforeAll(async () => {
    initialPasswordHash = await argon2.hash('InitialSeedPassword123!', { type: argon2.argon2id });
    changedPasswordHash = await argon2.hash('UserChangedPassword123!', { type: argon2.argon2id });
    deployPasswordHash = await argon2.hash('DeployEnvPassword123!', { type: argon2.argon2id });

    adminClient = postgres(baseAdminUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${TEST_DB_NAME}";`);

    sqlClient = postgres(testDbUrl);
    testDb = drizzle(sqlClient);

    const migrationsFolder = path.resolve(__dirname, '../migrations');
    await migrate(testDb, { migrationsFolder });

    setDatabaseUrl(testDbUrl);
  }, 30000);

  afterAll(async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD_HASH;

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

  it('inserts admin if missing, but never overwrites password or email on subsequent deploys', async () => {
    const ADMIN_ID = '018f3a5e-0000-7000-8000-000000000001';

    // 1. First deploy: inserts admin from environment
    process.env.ADMIN_EMAIL = INITIAL_ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD_HASH = initialPasswordHash;

    await seed();

    const [adminRow1] = await testDb.select().from(appUser).where(eq(appUser.id, ADMIN_ID));
    expect(adminRow1).toBeDefined();
    expect(adminRow1.email).toBe(INITIAL_ADMIN_EMAIL);
    expect(adminRow1.passwordHash).toBe(initialPasswordHash);

    // 2. User changes their password in the app
    await testDb
      .update(appUser)
      .set({
        passwordHash: changedPasswordHash,
        email: 'admin_updated_by_user@idmis.gov.ng',
      })
      .where(eq(appUser.id, ADMIN_ID));

    const [adminRowAfterUserUpdate] = await testDb
      .select()
      .from(appUser)
      .where(eq(appUser.id, ADMIN_ID));
    expect(adminRowAfterUserUpdate.passwordHash).toBe(changedPasswordHash);
    expect(adminRowAfterUserUpdate.email).toBe('admin_updated_by_user@idmis.gov.ng');

    // 3. Second deploy (e.g. Railway deploy with original or changed env variables)
    process.env.ADMIN_EMAIL = 'deploy_overwriting@idmis.gov.ng';
    process.env.ADMIN_PASSWORD_HASH = deployPasswordHash;

    await seed();

    // 4. Must NOT have overwritten the existing user's password or email
    const [adminRowAfterDeploy] = await testDb
      .select()
      .from(appUser)
      .where(eq(appUser.id, ADMIN_ID));
    expect(adminRowAfterDeploy.passwordHash).toBe(changedPasswordHash);
    expect(adminRowAfterDeploy.email).toBe('admin_updated_by_user@idmis.gov.ng');
    expect(adminRowAfterDeploy.passwordHash).not.toBe(deployPasswordHash);
    expect(adminRowAfterDeploy.email).not.toBe('deploy_overwriting@idmis.gov.ng');
  });
});
