'use client';

import { useEffect } from 'react';

let lockCount = 0;
let restoreOverflow = '';
let restorePaddingEnd = '';

/**
 * Freezes body scroll while any overlay is open, compensating for the scrollbar width so the
 * page does not shift. Reference-counted, so nested overlays unlock correctly.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const { body } = document;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      restoreOverflow = body.style.overflow;
      restorePaddingEnd = body.style.paddingInlineEnd;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) body.style.paddingInlineEnd = `${scrollbarWidth}px`;
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = restoreOverflow;
        document.body.style.paddingInlineEnd = restorePaddingEnd;
      }
    };
  }, [active]);
}
