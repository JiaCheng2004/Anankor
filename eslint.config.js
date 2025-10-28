const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
});

module.exports = [
  {
    ignores: ['dist', 'build', 'node_modules']
  },
  ...compat.config({
    env: {
      node: true,
      es2022: true
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      project: [
        './tsconfig.base.json',
        './packages/*/tsconfig.json',
        './apps/*/tsconfig.json'
      ],
      tsconfigRootDir: __dirname
    },
    plugins: ['@typescript-eslint'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier'
    ],
    rules: {
      'no-console': 'off'
    }
  })
];
