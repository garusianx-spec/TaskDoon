import type { AccentDescriptor, AccentId, ThemeConfig, ThemeMode } from '@taskin/contracts';

export const THEME_STORAGE_KEY = 'taskin.theme';

/** Indigo is the corporate default palette. */
export const DEFAULT_THEME: ThemeConfig = { mode: 'system', accent: 'indigo' };

export const THEME_MODES: ReadonlyArray<{ readonly id: ThemeMode; readonly label: string }> = [
  { id: 'system', label: 'سیستم' },
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تیره' },
];

/**
 * Swatches are the only place raw hex appears outside `tokens.css`: they are painted as
 * inline styles on the theme-picker preview, which must show *all six* palettes at once and
 * therefore cannot read the single active `--brand-*` variable. Each is [300, 500, 600].
 */
export const ACCENTS: readonly AccentDescriptor[] = [
  {
    id: 'indigo',
    name: 'سازمانی پیش‌فرض',
    subtitle: 'ایندیگو',
    swatch: ['#A4BCFD', '#6172F3', '#3538CD'],
    primaryHex: '#3538CD',
  },
  {
    id: 'teal',
    name: 'تمرکز عمیق',
    subtitle: 'سبزآبی',
    swatch: ['#5ECFC4', '#159489', '#0E766E'],
    primaryHex: '#0E766E',
  },
  {
    id: 'violet',
    name: 'استارتاپ مدرن',
    subtitle: 'بنفش الکتریک',
    swatch: ['#D6BBFB', '#9E77ED', '#6941C6'],
    primaryHex: '#6941C6',
  },
  {
    id: 'rose',
    name: 'رز شرابی',
    subtitle: 'زرشکی',
    swatch: ['#FAA7E0', '#C11574', '#9E165F'],
    primaryHex: '#9E165F',
  },
  {
    id: 'amber',
    name: 'گرمای سازمانی',
    subtitle: 'کهربایی',
    swatch: ['#FEC84B', '#F79009', '#B54708'],
    primaryHex: '#B54708',
  },
  {
    id: 'ocean',
    name: 'اقیانوس عمیق',
    subtitle: 'فیروزه‌ای',
    swatch: ['#67E3F9', '#06AED4', '#088AB2'],
    primaryHex: '#088AB2',
  },
];

const ACCENT_IDS: readonly AccentId[] = ACCENTS.map((accent) => accent.id);
const MODE_IDS: readonly ThemeMode[] = ['system', 'light', 'dark'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return MODE_IDS.some((mode) => mode === value);
}

export function isAccentId(value: unknown): value is AccentId {
  return ACCENT_IDS.some((accent) => accent === value);
}

/** Parses persisted JSON defensively — a corrupt entry falls back to the default theme. */
export function parseThemeConfig(raw: string | null): ThemeConfig {
  if (!raw) return DEFAULT_THEME;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_THEME;
    const record = parsed as Record<string, unknown>;
    return {
      mode: isThemeMode(record['mode']) ? record['mode'] : DEFAULT_THEME.mode,
      accent: isAccentId(record['accent']) ? record['accent'] : DEFAULT_THEME.accent,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Inline script executed before first paint. It writes `data-theme` / `data-accent` onto
 * <html> from localStorage (or the OS preference), so there is never a flash of the wrong
 * palette on hard navigation. Kept as a string because it must run synchronously in <head>,
 * ahead of React hydration.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var d=${JSON.stringify(DEFAULT_THEME)};
var modes=${JSON.stringify(MODE_IDS)};
var accents=${JSON.stringify(ACCENT_IDS)};
var raw=localStorage.getItem(k);
var cfg=d;
if(raw){try{var p=JSON.parse(raw);if(p&&typeof p==='object'){
cfg={mode:modes.indexOf(p.mode)>-1?p.mode:d.mode,
accent:accents.indexOf(p.accent)>-1?p.accent:d.accent};}}catch(e){}}
var m=cfg.mode==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):cfg.mode;
var r=document.documentElement;
r.setAttribute('data-theme',m);
r.setAttribute('data-accent',cfg.accent);
}catch(e){
document.documentElement.setAttribute('data-theme','light');
document.documentElement.setAttribute('data-accent',${JSON.stringify(DEFAULT_THEME.accent)});
}})();`;
