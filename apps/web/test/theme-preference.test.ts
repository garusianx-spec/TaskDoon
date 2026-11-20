import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { parseThemeConfig, THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
describe('fixed brand theme preference', () => {
  it.each(['light', 'dark', 'system'])('migrates legacy %s without its palette', (theme) => {
    expect(parseThemeConfig(JSON.stringify({ mode: theme, accent: 'rose' }))).toEqual({ theme });
    expect(parseThemeConfig(JSON.stringify({ theme }))).toEqual({ theme });
  });
  it.each([null, '{', 'null', '[]', '{"theme":"invalid"}'])('handles malformed preference %s', (raw) => {
    expect(parseThemeConfig(raw)).toEqual({ theme: 'system' });
  });
  it.each([true, false])('resolves system before paint (%s)', (matches) => {
    const attrs = new Map([['data-accent', 'rose']]);
    runInNewContext(THEME_BOOTSTRAP_SCRIPT, {
      localStorage: { getItem: () => JSON.stringify({ mode: 'system', accent: 'rose' }) },
      window: { matchMedia: () => ({ matches }) },
      document: {
        documentElement: {
          setAttribute: (k: string, v: string) => attrs.set(k, v),
          removeAttribute: (k: string) => attrs.delete(k),
        },
      },
    });
    expect(attrs.get('data-theme')).toBe(matches ? 'dark' : 'light');
    expect(attrs.has('data-accent')).toBe(false);
  });
});
