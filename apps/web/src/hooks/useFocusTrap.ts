'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

/**
 * Traps Tab/Shift+Tab inside `containerRef` while `active`, moves focus in on mount and
 * restores it to the previously focused element on unmount. Implements the WAI-ARIA
 * dialog keyboard contract for modals, drawers and bottom sheets.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: { readonly initialFocusRef?: RefObject<HTMLElement | null>; readonly restoreFocus?: boolean } = {},
): void {
  const { initialFocusRef, restoreFocus = true } = options;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Inside a trap, fields opt into initial focus with `data-autofocus` rather than React's
    // `autoFocus`: the latter focuses during commit, before this effect runs, so the trap
    // would record the field — not the opener — as the element to restore focus to.
    const focusFirst = () => {
      const explicit = initialFocusRef?.current ?? container.querySelector<HTMLElement>('[data-autofocus]');
      if (explicit) {
        explicit.focus();
        return;
      }
      const [first] = getFocusableElements(container);
      (first ?? container).focus();
    };

    // Defer one frame so the element is painted (and any entry animation has started)
    // before focus lands on it.
    const frame = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === first || !container.contains(activeEl))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('keydown', onKeyDown);
      if (restoreFocus) previouslyFocused?.focus();
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);
}
