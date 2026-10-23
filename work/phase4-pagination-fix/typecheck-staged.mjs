import ts from 'file:///C:/Users/garus/OneDrive/Desktop/taskin/node_modules/typescript/lib/typescript.js';
import { readFileSync } from 'node:fs';

const webRoot = 'C:/Users/garus/OneDrive/Desktop/taskin/apps/web';
const pagePath = webRoot + '/src/app/(admin)/admin/broadcasts/page.tsx';
const stagedPath = 'C:/Users/garus/Documents/Codex/2026-10-07/taskdoon/work/phase4-pagination-fix/apps/web/src/app/(admin)/admin/broadcasts/page.tsx';
const config = ts.readConfigFile(webRoot + '/tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, webRoot);
const options = { ...parsed.options, incremental: false, noEmit: true };
const host = ts.createCompilerHost(options);
const originalRead = host.readFile;
host.readFile = (path) => path.replaceAll('\\', '/').toLowerCase() === pagePath.toLowerCase() ? readFileSync(stagedPath, 'utf8') : originalRead(path);
const program = ts.createProgram(parsed.fileNames, options, host);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (path) => path, getCurrentDirectory: () => webRoot, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('Staged broadcasts page: full web TypeScript program passed (no emit).');
