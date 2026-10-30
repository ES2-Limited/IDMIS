import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexPath = path.resolve(__dirname, '../dist/index.js');
const distMigratePath = path.resolve(__dirname, '../dist/migrate.js');

describe('No Side Effects on Import (@idmis/db built dist)', () => {
  it('does not export runMigrations or MIGRATION_ADVISORY_LOCK_ID from root dist', async () => {
    const mod = await import(distIndexPath);
    expect(mod.runMigrations).toBeUndefined();
    expect(mod.MIGRATION_ADVISORY_LOCK_ID).toBeUndefined();
  });

  it('exports runMigrations and MIGRATION_ADVISORY_LOCK_ID from @idmis/db/migrate dist', async () => {
    const mod = await import(distMigratePath);
    expect(typeof mod.runMigrations).toBe('function');
    expect(mod.MIGRATION_ADVISORY_LOCK_ID).toBe(84729104);
  });

  it('importing built dist has zero side effects and does not attempt DB connection or migrations', async () => {
    // We execute node in an isolated child process with an unreachable database host.
    // If importing the bundle attempted a connection or ran migrations, it would hang or throw.
    const script = `
      const start = Date.now();
      import('${distIndexPath}').then((mod) => {
        if (mod.runMigrations) {
          process.exit(2);
        }
        // Output elapsed time to ensure instantaneous import without network calls
        console.log('IMPORTED_CLEANLY:' + (Date.now() - start));
        process.exit(0);
      }).catch((err) => {
        console.error('Import failed with error:', err);
        process.exit(1);
      });
    `;

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://invalid-user:invalid-pass@127.0.0.1:59999/nonexistent',
          MIGRATION_DATABASE_URL:
            'postgresql://invalid-user:invalid-pass@127.0.0.1:59999/nonexistent',
        },
        timeout: 5000,
      },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('IMPORTED_CLEANLY');
  });
});
