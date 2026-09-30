'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useNamespacedId } from '@/hooks/useId';
import { IconButton } from './IconButton';
import { CloseIcon } from '@/components/icons';

export interface SlideOverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  /** Rendered in the header between the title and the close button. */
  readonly actions?: ReactNode;
  /** Pinned under the header, above the scrolling body (tabs, filters). */
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

/**
 * Modal side panel anchored to the inline-start edge — beside the navigation rail on
 * desktop, full width on a phone. Same dialog contract as `Modal`: `aria-modal`, labelled
 * by its title, focus trapped and restored, Escape and overlay click close, scroll locked.
 *
 * Unlike `Drawer` (the inspector), it never docks into the layout: it is for transient,
 * app-wide surfaces such as the notification centre.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  actions,
  toolbar,
  children,
  footer,
  className,
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useNamespacedId('slideover-');
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  useFocusTrap(panelRef, open);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-modal">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 start-0 flex w-full flex-col border-e border-secondary bg-surface shadow-xl outline-none',
          'sm:w-[26rem] lg:start-rail',
          'rtl:animate-slide-in-right ltr:animate-slide-in-start',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex items-start gap-3 border-b border-secondary px-4 pb-3 pt-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id={titleId} className="text-heading-sm font-bold text-fg-primary">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-caption text-fg-tertiary">
                {description}
              </p>
            )}
          </div>
          {actions}
          <IconButton label="بستن" icon={<CloseIcon size={20} />} onClick={onClose} size="sm" className="-me-1" />
        </header>
        {toolbar && <div className="border-b border-secondary px-4 py-3">{toolbar}</div>}
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="border-t border-secondary bg-sunken px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
