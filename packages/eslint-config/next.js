import prettier from 'eslint-config-prettier';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { ignores, sharedRules } from './base.js';

/** Next.js apps: eslint-config-next registers typescript-eslint itself, so reuse it instead of base. */
export default [
  ignores,
  { ignores: ['next-env.d.ts'] },
  ...nextVitals,
  ...nextTs,
  sharedRules,
  prettier,
];
