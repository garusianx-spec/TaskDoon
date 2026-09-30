/**
 * Where the app's data comes from.
 *
 * - `api` (the default): the Taskin API. Sign-in is required, every change goes to the server
 *   and the socket keeps the screen in step with everyone else.
 * - `demo`: the built-in demo workspace in `src/data`, held in memory. Nothing leaves the
 *   browser; the front-end Playwright suites run against it.
 *
 * Chosen at build time with `NEXT_PUBLIC_DATA_SOURCE`.
 */
export type DataSource = 'api' | 'demo';

export const DATA_SOURCE: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === 'demo' ? 'demo' : 'api';

export const IS_LIVE = DATA_SOURCE === 'api';
