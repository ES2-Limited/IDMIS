import { runMigrations } from './migrate';
import { seed } from './seed';
import { client } from './index';

export async function release() {
  console.log('=== [release] Starting Database Release (Migrations + Core Seed) ===');
  try {
    console.log('[release] Step 1/2: Executing database migrations...');
    await runMigrations();
    console.log('[release] Database migrations completed successfully.');

    console.log('[release] Step 2/2: Executing core seed...');
    await seed();
    console.log('[release] Core seed completed successfully.');

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
