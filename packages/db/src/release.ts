import { runMigrations } from './migrate';
import { seed } from './seed';
import { client, setDatabaseUrl, type postgres } from './index';
import Redis from 'ioredis';

export const APP_SCHEMAS = (process.env.APP_SCHEMAS || 'core,slis,me,blis')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function applyDatabaseGrants(sqlClient: postgres.Sql, schemas = APP_SCHEMAS) {
  console.log(
    `[release] Applying database permissions for idmis_app across schemas: ${schemas.join(', ')}...`,
  );

  // 1. Ensure idmis_app role exists
  await sqlClient.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'idmis_app') THEN
        CREATE ROLE idmis_app LOGIN;
      END IF;
    END
    $$;
  `);

  // 2. Set password if provided
  const appDbPassword = process.env.APP_DB_PASSWORD;
  if (appDbPassword) {
    const escaped = appDbPassword.replace(/'/g, "''");
    await sqlClient.unsafe(`ALTER ROLE idmis_app WITH PASSWORD '${escaped}';`);
    console.log('[release] Updated password for role idmis_app');
  }

  // 3. Apply schema & table permissions
  for (const schemaName of schemas) {
    const [exists] = await sqlClient`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = ${schemaName};
    `;
    if (!exists) continue;

    await sqlClient.unsafe(`
      GRANT USAGE ON SCHEMA "${schemaName}" TO idmis_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schemaName}" TO idmis_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO idmis_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT USAGE, SELECT ON SEQUENCES TO idmis_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO idmis_app;
    `);
  }

  // 4. Strict insert-only security on core.audit_log
  const [auditLogExists] = await sqlClient`
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'audit_log';
  `;
  if (auditLogExists) {
    await sqlClient.unsafe(`
      REVOKE ALL ON "core"."audit_log" FROM idmis_app;
      GRANT SELECT, INSERT ON "core"."audit_log" TO idmis_app;
    `);
    console.log('[release] Configured insert-only privileges on core.audit_log for idmis_app');
  }

  console.log('[release] Database role grants and default privileges applied successfully.');
}

export async function release() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (migrationUrl) {
    setDatabaseUrl(migrationUrl);
  }

  console.log('=== [release] Starting Database Release (Migrations + Grants + Core Seed) ===');
  try {
    console.log('[release] Step 1/3: Executing database migrations...');
    await runMigrations();
    console.log('[release] Database migrations completed successfully.');

    console.log('[release] Step 2/3: Applying database role grants and default privileges...');
    await applyDatabaseGrants(client);

    console.log('[release] Step 3/3: Executing core seed...');
    const seedResult = await seed();
    console.log('[release] Core seed completed successfully.');

    if (seedResult && (seedResult.rolePermsInserted > 0 || seedResult.rolePermsDeleted > 0)) {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        console.log(
          `[release] Role permissions modified (${seedResult.rolePermsInserted} inserted, ${seedResult.rolePermsDeleted} deleted). Incrementing auth:rbac:epoch in Redis...`,
        );
        const redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          connectTimeout: 5000,
        });
        const newEpoch = await redis.incr('auth:rbac:epoch');
        console.log(`[release] Incremented auth:rbac:epoch to ${newEpoch}`);
        await redis.quit();
      } else {
        console.log('[release] REDIS_URL absent; skipping auth:rbac:epoch increment');
      }
    }

    console.log('=== [release] Database Release Finished Successfully ===');
  } catch (err) {
    console.error('[release] Database release failed:', err);
    throw err;
  }
}

const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1].endsWith('release.ts') ||
    process.argv[1].endsWith('release.js'));

if (isDirectRun) {
  release()
    .then(async () => {
      await client.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[release] Process exiting with error:', err);
      await client.end({ timeout: 5 }).catch(() => {});
      process.exit(1);
    });
}
