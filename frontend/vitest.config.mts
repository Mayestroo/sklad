import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Component tests (`*.test.tsx`, jsdom). Unit tests of plain TS stay on
 * Node's built-in runner (`*.spec.ts`, see package.json "test").
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.join(root, '..', 'shared'),
      '@': path.join(root, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    pool: 'threads',
    maxWorkers: 2,
  },
});
