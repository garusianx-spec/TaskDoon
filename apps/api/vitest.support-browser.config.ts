import { defineConfig } from 'vitest/config';
import support from './vitest.support.config.js';
export default defineConfig({
  ...support,
  test: { ...support.test, include: ['test/integration/support.browser.ts'], testTimeout: 120000 },
});
