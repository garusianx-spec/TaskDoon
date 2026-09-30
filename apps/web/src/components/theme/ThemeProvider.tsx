'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AccentId, ResolvedThemeMode, ThemeConfig, ThemeMode } from '@taskin/contracts';
import { DEFAULT_THEME, THEME_STORAGE_KEY, parseThemeConfig } from '@/lib/theme';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

interface ThemeContextValue {
  readonly theme: ThemeConfig;
  readonly resolvedMode: ResolvedThemeMode;
  readonly setMode: (mode: ThemeMode) => void;
  readonly setAccent: (accent: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolve = (mode: ThemeMode): ResolvedThemeMode =>
  mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;

/**
 * Owns the workspace/user theme. The DOM is the single source of truth for the *resolved*
 * mode (`data-theme`), matching what the pre-paint bootstrap script already wrote, so React
 * hydrates against the same attributes it would have produced.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [resolvedMode, setResolvedMode] = useState<ResolvedThemeMode>('light');

  // Adopt whatever the bootstrap script already applied, before the first paint React owns.
  useIsomorphicLayoutEffect(() => {
    const stored = parseThemeConfig(window.localStorage.getItem(THEME_STORAGE_KEY));
    setTheme(stored);
    setResolvedMode(resolve(stored.mode));
  }, []);

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedMode);
    root.setAttribute('data-accent', theme.accent);
  }, [resolvedMode, theme.accent]);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (theme.mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolvedMode(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme.mode]);

  // Keep every open tab of the workspace in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = parseThemeConfig(event.newValue);
      setTheme(next);
      setResolvedMode(resolve(next.mode));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: ThemeConfig) => {
    setTheme(next);
    setResolvedMode(resolve(next.mode));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). The in-memory theme
      // still applies for this session; nothing else depends on persistence succeeding.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedMode,
      setMode: (mode) => persist({ ...theme, mode }),
      setAccent: (accent) => persist({ ...theme, accent }),
    }),
    [theme, resolvedMode, persist],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}
