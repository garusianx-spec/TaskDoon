#!/usr/bin/env node
/**
 * `npm run dev -w @taskin/api`: compiles on change (tsc -b --watch) and restarts the server when
 * the output changes (node --watch). Load the environment first, e.g. from .env.example.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit' });

const compile = spawn('npx', ['tsc', '-b'], { cwd: root, stdio: 'inherit' });
compile.on('exit', (code) => {
  if (code !== 0 || !existsSync(new URL('../dist/main.js', import.meta.url))) process.exit(code ?? 1);
  const children = [
    run('npx', ['tsc', '-b', '--watch', '--preserveWatchOutput']),
    run(process.execPath, ['--enable-source-maps', '--watch-path=dist', 'dist/main.js']),
  ];
  const stop = () => children.forEach((child) => child.kill('SIGTERM'));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});
