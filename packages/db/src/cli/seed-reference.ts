import { seedReferenceData } from '../seed/seed-reference';
import { client } from '../index';

seedReferenceData()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Reference data seed failed:', err instanceof Error ? err.message : err);
    await client.end().catch(() => {});
    process.exit(1);
  });
