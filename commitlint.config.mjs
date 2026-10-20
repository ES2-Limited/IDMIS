export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci']],
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'slis',
        'me',
        'blis',
        'web',
        'api',
        'worker',
        'db',
        'contracts',
        'ui',
        'sync',
        'infra',
      ],
    ],
    'scope-empty': [2, 'never'],
  },
};
