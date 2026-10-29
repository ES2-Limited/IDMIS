import { seed } from '../seed';
import { client } from '../index';

seed()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await client.end().catch(() => {});
    process.exit(1);
  });
