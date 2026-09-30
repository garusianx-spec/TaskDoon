'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useNamespacedId } from '@/hooks/useId';
import { useIsDesktop } from '@/hooks/useMediaQuery';

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

/**
 * Contextual inspector.
 *
 * Desktop (≥1024px): a docked 380px column that participates in the flex layout — the main
 * workspace shrinks rather than being covered, and no focus trap or scroll lock applies
 * because the rest of the app stays interactive.
 *
 * Mobile: the same content promotes to a full-height modal sheet with the complete dialog
 * contract (trap, Escape, scroll lock, restore focus).
 */
export function Drawer({ open, onClose, title, children, header, footer, className }: DrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const isDesktop = useIsDesktop();
  const id = useNamespacedId('drawer-');
  const titleId = `${id}-title`;

  const asDialog = open && !isDesktop;
  useFocusTrap(panelRef, asDialog);
  useScrollLock(asDialog);

  useEffect(() => {
    if (!asDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [asDialog, onClose]);

  if (!open) return null;

  return (
    <>
      {asDialog && (
        <div
          className="fixed inset-0 z-drawer animate-fade-in bg-overlay/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={panelRef}
        role={asDialog ? 'dialog' : 'complementary'}
        aria-modal={asDialog || undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex flex-col overflow-hidden bg-surface outline-none',
          // Mobile: full-height sheet anchored to the inline-end edge.
          'fixed inset-y-0 end-0 z-drawer w-[min(24rem,100vw)] animate-slide-in-start border-s border-secondary shadow-xl',
          // Desktop: a docked column inside the shell.
          'lg:static lg:z-auto lg:w-inspector lg:animate-none lg:shadow-none',
          className,
        )}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {header}
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-secondary bg-sunken p-4">{footer}</div>}
      </aside>
    </>
  );
}
