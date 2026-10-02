'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useNamespacedId } from '@/hooks/useId';
import { IconButton, MenuList } from '@/components/ui';
import { MoreHorizontalIcon } from '@/components/icons';

const GAP = 6;

/**
 * A ⋯ row menu for the admin tables. The panel is fixed to the viewport (in a portal) rather
 * than anchored inside the table, whose horizontal scroll would clip it. Same contract as
 * `Popover`: Escape closes and returns focus, an outside press, a scroll or a resize closes, focus
 * moves to the first item; arrow keys move between items (`MenuList`).
 *
 * `children` gets `choose`, which closes the menu (focus back on the button) and then runs the
 * item's action.
 */
export function FixedMenu({
  label,
  children,
  width = 248,
}: {
  readonly label: string;
  readonly children: (choose: (action: () => void) => void) => ReactNode;
  readonly width?: number;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useNamespacedId('row-menu-');
  const open = anchor !== null;

  const close = useCallback((refocus: boolean) => {
    setAnchor(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    if (open) close(false);
    else setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
  };

  // Under the button, or above it when the viewport has no room below; its inline-end edge on the button's.
  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const height = panel.offsetHeight;
    const below = anchor.bottom + GAP;
    panel.style.top = `${below + height > window.innerHeight - 8 && anchor.top - GAP - height > 8 ? anchor.top - GAP - height : below}px`;
    panel.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)}px`;
  }, [anchor, width]);

  const refs = useMemo(() => [triggerRef, panelRef], []);
  useOnClickOutside(refs, () => close(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onMove = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close]);

  const choose = (action: () => void) => {
    close(true);
    action();
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        label={label}
        icon={<MoreHorizontalIcon size={16} />}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      />
      {anchor &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            dir="rtl"
            style={{ top: anchor.bottom + GAP, left: anchor.left, width }}
            className="surface-floating fixed z-popover animate-scale-in p-1.5 outline-none"
          >
            <MenuList>{children(choose)}</MenuList>
          </div>,
          document.body,
        )}
    </>
  );
}
