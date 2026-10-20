export default {
  '*': 'prettier --ignore-unknown --write',
  '*.{js,ts,tsx}': 'eslint --fix',
};
