'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useNamespacedId } from '@/hooks/useId';

export interface TaskDetailDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Announced as the dialog's name; the inspector inside shows the task's own title. */
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * The task inspector as a centred dialog over a dimmed, blurred workspace. It keeps the
 * `Modal` contract (focus trapped and restored, Escape, background scroll locked), but the
 * inspector brings its own header, and the whole panel scrolls as one page.
 */
export function TaskDetailDialog({ open, onClose, title, children }: TaskDetailDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = `${useNamespacedId('task-dialog-')}-title`;

  // Focus lands on the panel itself, so the dialog's name is read first and no control
  // (the star, with its tooltip) lights up on open.
  useFocusTrap(panelRef, open, { initialFocusRef: panelRef });
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
    <div className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="scrollbar-thin relative max-h-[90vh] w-full max-w-4xl animate-scale-in overflow-y-auto rounded-2xl border border-secondary bg-surface shadow-2xl outline-none"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
