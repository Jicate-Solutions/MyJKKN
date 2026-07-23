// Flat ESLint config for Next 16 + eslint-config-next 16.x.
// Migrated 2026-05-20 from legacy .eslintrc.json: Next 16 dropped `next lint`
// and eslint-config-next@16 ships a flat-config array (peerDep eslint>=9), so
// the old extends-chain in .eslintrc.json crashed `npx eslint` with a
// "circular structure to JSON" error under ESLint 8.

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores — first config block per flat-config semantics.
  // node_modules + .git are ignored by default.
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'next-env.d.ts',
      'public/sw.js',
      'public/workbox-*.js',
    ],
  },
  // Next.js core-web-vitals + typescript presets (flat-config arrays).
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Project-level rule overrides — preserved verbatim from prior .eslintrc.json.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
