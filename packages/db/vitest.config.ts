import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    cache: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
