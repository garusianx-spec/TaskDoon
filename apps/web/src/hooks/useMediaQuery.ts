'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * SSR-safe media query subscription. `useSyncExternalStore` gives React the server snapshot
 * (`false`) during hydration and the real value immediately after, so there is no mismatch
 * warning and no flash of the wrong layout beyond the first paint.
 *
 * Layout chrome is still driven by CSS breakpoints wherever possible; this hook is reserved
 * for behaviour that CSS cannot express (e.g. whether the inspector renders as a docked
 * panel or a full-height mobile sheet).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => list.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `lg` breakpoint — the desktop shell (rail + sidebar + inspector) takes over here. */
export const useIsDesktop = (): boolean => useMediaQuery('(min-width: 1024px)');
