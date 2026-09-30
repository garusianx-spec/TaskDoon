'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Fires when a pointer goes down outside every supplied ref. Uses `pointerdown` so the
 * dismissal happens before focus moves, which keeps menu/trigger toggling from double-firing.
 */
export function useOnClickOutside(
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  handler: (event: PointerEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const listener = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      for (const ref of refs) {
        if (ref.current?.contains(target)) return;
      }
      handler(event);
    };

    document.addEventListener('pointerdown', listener, true);
    return () => document.removeEventListener('pointerdown', listener, true);
  }, [refs, handler, enabled]);
}
