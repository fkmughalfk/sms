import globals from 'globals';
import base from './base.js';

/** NestJS apps: Node + Jest globals; DI needs runtime (non-type) imports for decorated params. */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
