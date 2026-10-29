import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/migrate.ts',
    'src/seed.ts',
    'src/release.ts',
    'src/cli/migrate.ts',
    'src/cli/seed.ts',
  ],
  format: ['esm'],
  target: 'node22',
  clean: true,
  bundle: true,
  noExternal: [/^@idmis\//],
  external: ['postgres', 'drizzle-orm', 'argon2'],
  outDir: 'dist',
  sourcemap: true,
});
