import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Unit tests: no Postgres, Redis or S3. SWC compiles the sources so decorator metadata (Nest DI) survives. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/unit/setup.ts'],
    environment: 'node',
  },
});
