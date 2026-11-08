import { runLoadSeed } from '../seed/load-seed';

runLoadSeed()
  .then((result) => {
    console.log(
      `[load-seed] Finished successfully. Seeded: ${result.seeded}, Total: ${result.total}`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error('[load-seed] Failed:', (err as Error).message || err);
    process.exit(1);
  });
