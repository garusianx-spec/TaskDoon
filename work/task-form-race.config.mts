import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const path = resolve(root, 'apps/web/src/store/live/live-store.ts').replaceAll('\\', '/');
const before = readFileSync(path, 'utf8').replace('const detail = await api.tasks.get(this.workspaceId, id);\n      this.upsertDetail(detail);', 'const detail = await api.tasks.get(this.workspaceId, id);\n      this.versions.delete(id);\n      this.upsertDetail(detail);');
export default { root: resolve(root, 'apps/web'), plugins: [{ name: 'race-before-only', enforce: 'pre', transform(source, id) { return id.replaceAll('\\', '/') === path ? before : null; } }], oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias: { '@': resolve(root, 'apps/web/src') } }, test: { environment: 'node', include: ['test/task-form-persistence.test.ts'] } };
