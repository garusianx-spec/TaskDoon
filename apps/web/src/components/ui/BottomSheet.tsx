'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useNamespacedId } from '@/hooks/useId';

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Mobile action sheet — the surface behind long-press on a chat bubble and the swipe
 * "postpone / reassign" flow. Same dialog contract as `Modal`, anchored to the bottom edge
 * and padded for the home indicator via `env(safe-area-inset-bottom)`.
 */
export function BottomSheet({ open, onClose, title, description, children, className }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useNamespacedId('sheet-');
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
    <div className="fixed inset-0 z-modal flex items-end justify-center">
      <div className="absolute inset-0 animate-fade-in bg-overlay/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[85vh] w-full animate-slide-up flex-col rounded-t-3xl border-t border-secondary bg-surface shadow-xl outline-none',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        </div>
        <div className="px-5 pb-2 pt-1">
          <h2 id={titleId} className="text-title font-bold text-fg-primary">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-body-sm text-fg-tertiary">
              {description}
            </p>
          )}
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
