import { existsSync } from 'node:fs';

if (
  process.env.CI ||
  process.env.NODE_ENV === 'production' ||
  process.env.HUSKY === '0' ||
  !existsSync('.git')
) {
  process.exit(0);
}

const { default: install } = await import('husky');
const error = install();
if (error) {
  console.error(error);
  process.exitCode = 1;
}
