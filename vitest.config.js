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
    environmentMatchGlobs: [
      ['**/__tests__/schedule-restore-dialog.test.tsx', 'jsdom'],
      ['**/__tests__/batch-size-selector.test.tsx', 'jsdom'],
      ['**/__tests__/question-papers/**/*.test.tsx', 'jsdom'],
    ],
  },
});
