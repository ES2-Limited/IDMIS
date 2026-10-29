import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    cache: false,
    globalSetup: ['./vitest.global-setup.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
