/**
 * Build-only artifact assembly. This file never enters either runtime image.
 * Keep production JavaScript and the current-platform native binary, without build inputs.
 */
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const [mode, sourceArg, destinationArg] = process.argv.slice(2);
const source = resolve(sourceArg ?? '');
if (source !== '/repo') throw new Error('Expected the isolated /repo build directory.');

async function removeBuildMetadata(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['.bin', '@types', 'typescript', 'node-addon-api', 'node-gyp'].includes(entry.name)) {
        await rm(file, { recursive: true });
      } else if (entry.name === 'node-gyp-build' && file.includes('/node_modules/')) {
        const manifest = JSON.parse(await readFile(join(file, 'package.json'), 'utf8'));
        if (manifest.name !== 'node-gyp-build') throw new Error('Unexpected native-loader package.');
        // argon2 requires index.js/node-gyp-build.js at runtime. These three entrypoints
        // only compile or test addons during installation and never belong in the daemon.
        for (const installCli of ['bin.js', 'build-test.js', 'optional.js']) {
          await rm(join(file, installCli), { force: true });
        }
        await removeBuildMetadata(file);
      } else if (entry.name === 'prebuilds') {
        const platformDirectory = process.platform + '-' + process.arch;
        for (const binaryDirectory of await readdir(file, { withFileTypes: true })) {
          if (binaryDirectory.name !== platformDirectory) {
            await rm(join(file, binaryDirectory.name), { recursive: true });
          } else {
            await removeBuildMetadata(join(file, binaryDirectory.name));
          }
        }
      } else {
        await removeBuildMetadata(file);
      }
    } else if (
      ['.ts', '.mts', '.cts', '.map', '.tsbuildinfo', '.c', '.cc', '.cpp', '.h', '.hpp', '.gyp', '.gypi']
        .some((suffix) => entry.name.endsWith(suffix))
      || entry.name.endsWith('.glibc.node')
    ) {
      await rm(file);
    }
  }
}

/** Follow only installed, locked production/optional dependencies, preserving npm's paths. */
async function copyMigrationDependencies(destination) {
  const visited = new Set();
  await mkdir(join(destination, 'apps/api/node_modules'), { recursive: true });
  async function copyDependency(name, importingDirectory) {
    const require = createRequire(join(importingDirectory, 'package.json'));
    let directory;
    try {
      directory = dirname(require.resolve(name + '/package.json'));
    } catch {
      directory = dirname(require.resolve(name));
      while (true) {
        try {
          const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
          if (manifest.name === name) break;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const parent = dirname(directory);
        if (parent === directory) throw new Error('Could not find manifest for ' + name);
        directory = parent;
      }
    }
    if (!directory.startsWith(source + '/node_modules/') && !directory.startsWith(source + '/apps/api/node_modules/')) {
      throw new Error('Dependency escaped the isolated installation: ' + directory);
    }
    if (visited.has(directory)) return;
    visited.add(directory);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    await cp(directory, join(destination, relative(source, directory)), { recursive: true });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      await copyDependency(dependency, directory);
    }
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      try {
        require.resolve(dependency);
      } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') continue;
        throw error;
      }
      await copyDependency(dependency, directory);
    }
  }
  for (const dependency of ['pg', 'drizzle-orm']) {
    await copyDependency(dependency, join(source, 'apps/api'));
  }
  console.log('Migration dependency closure: ' + visited.size + ' locked production packages.');
}

if (mode === 'dependencies') {
  await removeBuildMetadata(join(source, 'node_modules'));
  await removeBuildMetadata(join(source, 'apps/api/node_modules'));
} else if (mode === 'migrations') {
  const destination = resolve(destinationArg ?? '');
  if (destination !== '/migration-runtime') throw new Error('Expected the isolated /migration-runtime directory.');
  await copyMigrationDependencies(destination);
} else if (mode === 'assets') {
  const destination = resolve(destinationArg ?? '');
  if (destination !== '/runtime') throw new Error('Expected the isolated /runtime artifact directory.');
  for (const workspace of ['packages/contracts', 'packages/jalali', 'packages/text', 'apps/api']) {
    const target = join(destination, workspace);
    await mkdir(target, { recursive: true });
    await cp(join(source, workspace, 'package.json'), join(target, 'package.json'));
    await cp(join(source, workspace, 'dist'), join(target, 'dist'), { recursive: true });
    await removeBuildMetadata(join(target, 'dist'));
  }
  await rm(join(destination, 'apps/api/dist/cli'), { recursive: true });
  await rm(join(destination, 'apps/api/dist/platform/db/migrate.js'));
} else {
  throw new Error('Usage: api-runtime.mjs dependencies /repo | migrations /repo /migration-runtime | assets /repo /runtime');
}
