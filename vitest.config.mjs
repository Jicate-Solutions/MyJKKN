import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Stale git worktrees under .claude/ carry their own copies of the test
    // suite. Vitest's default exclude list does not know about them, so every
    // run collected each test twice — and the duplicate always FAILED, because
    // the `@` alias above resolves against process.cwd() (the main repo) while
    // the file lives in the worktree. Two phantom failures per test file, none
    // of them about the code under test.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.claude/worktrees/**',
    ],
    environmentMatchGlobs: [
      ['**/__tests__/schedule-restore-dialog.test.tsx', 'jsdom'],
      ['**/__tests__/batch-size-selector.test.tsx', 'jsdom'],
      ['**/__tests__/question-papers/**/*.test.tsx', 'jsdom'],
    ],
  },
});
