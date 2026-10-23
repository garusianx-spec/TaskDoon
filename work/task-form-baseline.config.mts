import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const before = new Map([['apps/web/src/store/live/live-store.ts', 'work/task-form-baseline-store.ts'], ['apps/web/src/store/workspace-reducer.ts', 'work/task-form-baseline-reducer.ts']].map(([path, baseline]) => [resolve(root, path).replaceAll('\\', '/'), readFileSync(baseline, 'utf8')]));
export default { root: resolve(root, 'apps/web'), plugins: [{ name: 'baseline-only', enforce: 'pre', transform(source, id) { return before.get(id.replaceAll('\\', '/')) ?? null; } }], oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias: { '@': resolve(root, 'apps/web/src') } }, test: { environment: 'node', include: ['test/task-form-persistence.test.ts'] } };
