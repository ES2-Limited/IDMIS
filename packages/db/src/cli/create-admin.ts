import { createAdmin } from '../create-admin';
import { client } from '../index';

createAdmin()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    await client.end().catch(() => {});
    process.exit(1);
  });
