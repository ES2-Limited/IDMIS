import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    cache: false,
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
  resolve: {
    alias: {
      'virtual:pwa-register/react': path.resolve(__dirname, 'src/pwa/__mocks__/pwa-register.ts'),
    },
  },
});
