import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    cache: false,
    globalSetup: ['./vitest.global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
