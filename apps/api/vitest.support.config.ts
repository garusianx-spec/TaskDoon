import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/support.integration.spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/support-preserved.setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
