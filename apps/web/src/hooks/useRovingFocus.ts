'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';

export type RovingOrientation = 'horizontal' | 'vertical';

interface RovingFocusApi {
  readonly registerItem: (index: number) => (node: HTMLElement | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly focusIndex: (index: number) => void;
}

/**
 * Roving-tabindex keyboard navigation for composite widgets (tablists, menus, segmented
 * controls, kanban columns).
 *
 * In a horizontal RTL widget, ArrowLeft advances and ArrowRight retreats — the visual
 * direction the user expects. `dir` is read from the focused element at keypress time so a
 * single implementation serves both directions.
 */
export function useRovingFocus(
  itemCount: number,
  orientation: RovingOrientation,
  options: { readonly loop?: boolean; readonly onActivate?: (index: number) => void } = {},
): RovingFocusApi {
  const { loop = true, onActivate } = options;
  const items = useRef<Array<HTMLElement | null>>([]);

  const registerItem = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      items.current[index] = node;
    },
    [],
  );

  const focusIndex = useCallback((index: number) => {
    items.current[index]?.focus();
  }, []);

  const move = useCallback(
    (from: number, delta: number) => {
      if (itemCount === 0) return;
      let next = from + delta;
      if (next < 0) next = loop ? itemCount - 1 : 0;
      if (next >= itemCount) next = loop ? 0 : itemCount - 1;
      focusIndex(next);
      onActivate?.(next);
    },
    [itemCount, loop, focusIndex, onActivate],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const current = items.current.findIndex((node) => node === event.target);
      if (current === -1) return;

      const isRtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
      const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';

      switch (event.key) {
        case forward:
          if (orientation === 'horizontal') {
            event.preventDefault();
            move(current, 1);
          }
          break;
        case backward:
          if (orientation === 'horizontal') {
            event.preventDefault();
            move(current, -1);
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical') {
            event.preventDefault();
            move(current, 1);
          }
          break;
        case 'ArrowUp':
          if (orientation === 'vertical') {
            event.preventDefault();
            move(current, -1);
          }
          break;
        case 'Home':
          event.preventDefault();
          focusIndex(0);
          onActivate?.(0);
          break;
        case 'End':
          event.preventDefault();
          focusIndex(itemCount - 1);
          onActivate?.(itemCount - 1);
          break;
        default:
          break;
      }
    },
    [orientation, move, focusIndex, itemCount, onActivate],
  );

  return { registerItem, onKeyDown, focusIndex };
}
