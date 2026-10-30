import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../migrations');

export const MIGRATION_ADVISORY_LOCK_ID = 84729104;

export interface RunMigrationsOptions {
  connectionString?: string;
  client?: postgres.Sql;
  db?: ReturnType<typeof drizzle>;
}

export async function runMigrations(options: RunMigrationsOptions = {}) {
  let sql: postgres.Sql;
  let migrationDb: ReturnType<typeof drizzle>;
  let shouldCloseSql = false;

  if (options.client) {
    sql = options.client;
    migrationDb = options.db ?? drizzle(sql);
  } else if (options.connectionString) {
    sql = postgres(options.connectionString, { max: 5 });
    migrationDb = options.db ?? drizzle(sql);
    shouldCloseSql = true;
  } else {
    const connStr =
      process.env.MIGRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://idmis:idmis@localhost:5432/idmis';
    sql = postgres(connStr, { max: 5 });
    migrationDb = options.db ?? drizzle(sql);
    shouldCloseSql = true;
  }

  const reserved = await sql.reserve();
  let lockAcquired = false;
  try {
    console.log(`[db:migrate] Acquiring advisory lock (${MIGRATION_ADVISORY_LOCK_ID})...`);
    await reserved`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_ID})`;
    lockAcquired = true;
    console.log(
      `[db:migrate] Advisory lock acquired. Running migrations from ${migrationsFolder}...`,
    );
    await migrate(migrationDb, { migrationsFolder });
    console.log('[db:migrate] Migrations completed successfully.');
  } finally {
    if (lockAcquired) {
      try {
        await reserved`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_ID})`;
        console.log(`[db:migrate] Released advisory lock (${MIGRATION_ADVISORY_LOCK_ID}).`);
      } catch (unlockErr) {
        console.error('[db:migrate] Error releasing advisory lock:', unlockErr);
      }
    }
    reserved.release();
    if (shouldCloseSql) {
      await sql.end();
    }
  }
}
