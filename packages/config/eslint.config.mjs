import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        {
          type: 'api-module',
          pattern: ['apps/api/src/modules/*', 'src/modules/*'],
          mode: 'folder',
          capture: ['module'],
        },
        {
          type: 'web-module',
          pattern: ['apps/web/src/modules/*', 'src/modules/*'],
          mode: 'folder',
          capture: ['module'],
        },
      ],
      'boundaries/ignore': ['**/*.test.*', '**/*.spec.*'],
    },
    rules: {
      // Architectural boundary rule: In apps/api, a module may import from another module ONLY through that module's "public" folder.
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              // A module can import any file from within its own module
              target: [['api-module', { module: '${from.module}' }]],
              allow: '**',
            },
            {
              // A module may import from another module ONLY through that module's "public" folder
              target: ['api-module'],
              allow: ['public/**', 'public'],
            },
            {
              // Allow web modules internal imports
              target: ['web-module'],
              allow: '**',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
    ],
  },
);
