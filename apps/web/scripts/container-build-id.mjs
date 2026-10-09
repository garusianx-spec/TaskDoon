import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Hash only Docker's copied Web inputs and explicit nonsecret build variables. */
export function containerBuildId() {
  const files = [
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    'apps/api/package.json',
    'apps/web/package.json',
    'apps/web/next.config.mjs',
    'apps/web/tsconfig.json',
    'apps/web/eslint.config.mjs',
    'apps/web/postcss.config.mjs',
    'apps/web/tailwind.config.ts',
    'apps/web/scripts/container-build-id.mjs',
  ];
  const ignored = (name) => name === '.env' || name.startsWith('.env.') ||
    name === 'node_modules' || name === 'dist' || name === '.next' ||
    name === 'coverage' || name.endsWith('.tsbuildinfo');

  function collect(directory) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (ignored(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build inputs must not contain symlinks');
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile()) files.push(file);
    }
  }

  for (const workspace of ['contracts', 'jalali', 'text']) {
    files.push(`packages/${workspace}/package.json`, `packages/${workspace}/tsconfig.json`);
    collect(`packages/${workspace}/src`);
  }
  collect('apps/web/src');
  collect('apps/web/public');

  const hash = createHash('sha256');
  for (const file of files.map((name) => relative(root, join(root, name)).split(sep).join('/')).sort()) {
    const content = readFileSync(join(root, file));
    hash.update(`file:${file}\0${content.length}\0`);
    hash.update(content);
  }

  const variables = {
    NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE ?? 'api',
    NEXT_PUBLIC_RT_URL: process.env.NEXT_PUBLIC_RT_URL ?? '',
    TASKIN_API_ORIGIN: process.env.TASKIN_API_ORIGIN ?? 'http://localhost:4000',
    NODE_ENV: 'production',
    NODE_VERSION: process.version,
  };
  hash.update(JSON.stringify(variables));
  return hash.digest('hex');
}
