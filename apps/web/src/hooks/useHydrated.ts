import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * `false` while the server renders and while React hydrates that HTML, `true` from the render
 * right after. Gate anything the server cannot know — the browser's clock, or seed data laid
 * out from it — so the hydration render matches the server markup and the real value follows
 * immediately. Client-side navigations get `true` straight away, with no placeholder flash.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
