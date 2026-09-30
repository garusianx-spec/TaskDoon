import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests against real PostgreSQL and Redis (see test/integration/README in the API docs).
 * The global setup migrates a fresh database; every test file boots its own app and creates its
 * own users and workspaces, so files run in parallel without sharing rows.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
