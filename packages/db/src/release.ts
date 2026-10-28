import { runMigrations } from './migrate';
import { seed } from './seed';
import { client } from './index';
import Redis from 'ioredis';

export async function release() {
  console.log('=== [release] Starting Database Release (Migrations + Core Seed) ===');
  try {
    console.log('[release] Step 1/2: Executing database migrations...');
    await runMigrations();
    console.log('[release] Database migrations completed successfully.');

    console.log('[release] Step 2/2: Executing core seed...');
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
