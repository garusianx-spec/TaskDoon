import type { ThemeConfig, ThemeMode } from '@taskin/contracts';
export const THEME_STORAGE_KEY = 'taskin.theme';
export const DEFAULT_THEME: ThemeConfig = { theme: 'system' };
export const THEME_MODES: ReadonlyArray<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تیره' },
  { id: 'system', label: 'سیستم' },
];
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}
/** Accept legacy mode/accent entries while discarding the palette permanently. */
export function parseThemeConfig(raw: string | null): ThemeConfig {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return DEFAULT_THEME;
    const record = value as Record<string, unknown>;
    const mode = record['theme'] ?? record['mode'];
    return { theme: isThemeMode(mode) ? mode : 'system' };
  } catch {
    return DEFAULT_THEME;
  }
}
export const THEME_BOOTSTRAP_SCRIPT = `(function(){
var mode='system';try{var p=JSON.parse(localStorage.getItem('taskin.theme')||'null');
var v=p&&(p.theme||p.mode);if(['light','dark','system'].indexOf(v)>-1)mode=v;}catch(e){}
var dark=false;try{dark=window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){}
document.documentElement.setAttribute('data-theme',mode==='system'?(dark?'dark':'light'):mode);
document.documentElement.removeAttribute('data-accent');
})();`;
