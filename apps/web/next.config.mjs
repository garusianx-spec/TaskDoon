import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The API the app talks to (`NEXT_PUBLIC_DATA_SOURCE=api`, the default). Its REST routes and its
 * Socket.IO gateway are proxied under this app's own origin, so the refresh cookie is first-party
 * and needs no CORS. In production the edge (nginx) routes both paths the same way.
 */
const apiOrigin = process.env.TASKIN_API_ORIGIN ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dev-tools badge sits bottom-left, over the composer's send button in this RTL layout.
  devIndicators: false,
  eslint: { dirs: ['src'] },
  // Workspace packages ship compiled ES2022; let SWC bring them to the app's browser targets.
  transpilePackages: ['@taskin/contracts', '@taskin/jalali', '@taskin/text'],
  // The lockfile lives at the monorepo root; trace server files from there, not from apps/web.
  outputFileTracingRoot: monorepoRoot,
  // Socket.IO's path ends in a slash (`/rt/`); redirecting it to `/rt` would break the handshake.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
      { source: '/rt/', destination: `${apiOrigin}/rt/` },
    ];
  },
};

export default nextConfig;
