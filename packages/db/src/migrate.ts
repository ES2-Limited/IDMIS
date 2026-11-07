import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import path from 'node:path';
import fs from 'node:fs';
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

export async function areMigrationsUp(sqlClient?: postgres.Sql): Promise<boolean> {
  let sql: postgres.Sql;
  let shouldClose = false;

  if (sqlClient) {
    sql = sqlClient;
  } else {
    const connStr =
      process.env.MIGRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://idmis:idmis@localhost:5432/idmis';
    sql = postgres(connStr, { max: 2 });
    shouldClose = true;
  }

  try {
    const tableCheck = await sql`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    `;
    if (!tableCheck.length) {
      return false;
    }

    let expectedCount = 24;
    try {
      const journalPath = path.resolve(migrationsFolder, 'meta/_journal.json');
      if (fs.existsSync(journalPath)) {
        const raw = fs.readFileSync(journalPath, 'utf8');
        const journal = JSON.parse(raw);
        if (Array.isArray(journal?.entries)) {
          expectedCount = journal.entries.length;
        }
      }
    } catch {
      // fallback
    }

    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text as count FROM "drizzle"."__drizzle_migrations"
    `;
    const count = parseInt(rows[0]?.count ?? '0', 10);
    return count >= expectedCount;
  } catch {
    return false;
  } finally {
    if (shouldClose) {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }
}
