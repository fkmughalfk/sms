import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export const ignores = {
  ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/generated/**'],
};

/** Rules layered on top of typescript-eslint in every preset. */
export const sharedRules = {
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  },
};

/** Shared rules for every TypeScript package in the monorepo. */
export default tseslint.config(
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sharedRules,
  prettier,
);
