import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './index';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../migrations');

export async function runMigrations() {
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations completed successfully.');
}

const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('migrate.ts') ||
    process.argv[1].endsWith('migrate.js'));

if (isDirectRun) {
  runMigrations()
    .then(async () => {
      await client.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await client.end();
      process.exit(1);
    });
}
