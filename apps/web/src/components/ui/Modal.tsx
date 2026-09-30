'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useNamespacedId } from '@/hooks/useId';
import { IconButton } from './IconButton';
import { CloseIcon } from '@/components/icons';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: ModalSize;
  readonly icon?: ReactNode;
  /** Set false for destructive flows that must be dismissed with an explicit choice. */
  readonly dismissOnOverlayClick?: boolean;
  readonly className?: string;
  /** `alertdialog` for a message that interrupts the user and waits for an acknowledgement. */
  readonly role?: 'dialog' | 'alertdialog';
}

const SIZES: Readonly<Record<ModalSize, string>> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[min(80rem,calc(100vw-3rem))]',
};

/**
 * WAI-ARIA dialog: `aria-modal`, labelled by its title, focus trapped, Escape to close,
 * background scroll locked and focus restored to the opener on unmount.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
  dismissOnOverlayClick = true,
  className,
  role = 'dialog',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useNamespacedId('modal-');
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
    <div className="fixed inset-0 z-modal flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay/60 backdrop-blur-[2px]"
        onClick={dismissOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[min(90vh,52rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-secondary bg-surface shadow-xl outline-none',
          'animate-slide-up sm:animate-scale-in sm:rounded-2xl',
          SIZES[size],
          className,
        )}
      >
        <header className="flex items-start gap-4 border-b border-secondary px-5 py-4 sm:px-6">
          {icon && (
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-fg-brand">
              {icon}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-heading-sm font-bold text-fg-primary">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-body-sm text-fg-tertiary">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="بستن"
            icon={<CloseIcon size={20} />}
            onClick={onClose}
            size="sm"
            className="-me-1.5 -mt-1"
          />
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary bg-sunken px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
