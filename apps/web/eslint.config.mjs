import baseConfig from '@idmis/config/eslint';

export default [
  {
    ignores: ['dev-dist/**', 'dist/**'],
  },
  ...baseConfig,
];
