'use client';

import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useNamespacedId } from '@/hooks/useId';

export type PopoverPlacement = 'top' | 'bottom';
export type PopoverAlign = 'start' | 'end' | 'center';

export interface PopoverProps {
  /** Trigger element. It receives `ref`, `aria-expanded`, `aria-haspopup` and `onClick`. */
  readonly trigger: ReactElement<{
    ref?: RefObject<HTMLElement | null>;
    onClick?: () => void;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog' | 'menu';
    'aria-controls'?: string;
  }>;
  readonly children: ReactNode | ((close: () => void) => ReactNode);
  readonly placement?: PopoverPlacement;
  readonly align?: PopoverAlign;
  readonly label: string;
  readonly className?: string;
  readonly panelClassName?: string;
  readonly haspopup?: 'dialog' | 'menu';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * Anchored floating panel with the full dismissal contract: Escape closes and returns focus
 * to the trigger, an outside pointer-down closes, and focus moves into the panel on open.
 *
 * Positioning is pure CSS (absolute + logical `start`/`end` insets), so the panel flips with
 * the document direction without a positioning library or a resize listener.
 */
export function Popover({
  trigger,
  children,
  placement = 'bottom',
  align = 'end',
  label,
  className,
  panelClassName,
  haspopup = 'dialog',
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useNamespacedId('popover-');

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  const refs = useMemo(() => [triggerRef, panelRef], []);
  useOnClickOutside(refs, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const alignClass =
    align === 'center'
      ? 'start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2'
      : align === 'start'
        ? 'start-0'
        : 'end-0';

  return (
    <div className={cn('relative inline-flex', className)}>
      {cloneElement(trigger, {
        ref: triggerRef,
        'aria-expanded': open,
        'aria-haspopup': haspopup,
        'aria-controls': open ? panelId : undefined,
        onClick: () => setOpen(!open),
      })}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role={haspopup === 'menu' ? 'menu' : 'dialog'}
          aria-label={label}
          tabIndex={-1}
          className={cn(
            'surface-floating absolute z-popover min-w-56 animate-scale-in p-1.5 outline-none',
            placement === 'bottom' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]',
            alignClass,
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export interface PopoverSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function PopoverSection({ title, children, className }: PopoverSectionProps) {
  return (
    <div className={cn('py-1', className)}>
      {title && (
        <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

export function PopoverDivider() {
  return <div className="my-1 border-t border-secondary" role="separator" />;
}
