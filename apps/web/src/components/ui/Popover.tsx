'use client';

import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { constrainedPopoverPosition, constrainedPopoverVerticalPosition } from '@/lib/popover-position';

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
  /** Keep wide panels inside the viewport and enclosing scroll/clip regions. */
  readonly constrainToViewport?: boolean;
}

/**
 * Anchored floating panel with the full dismissal contract: Escape closes and returns focus
 * to the trigger, an outside pointer-down closes, and focus moves into the panel on open.
 *
 * Default positioning uses CSS logical insets. Wide calendars opt into collision handling
 * against the viewport and scroll ancestors while remaining inside the modal's focus trap.
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
  constrainToViewport = false,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useNamespacedId('popover-');
  const [position, setPosition] = useState<{
    readonly left: number; readonly top: number; readonly maxWidth: number; readonly maxHeight: number;
  } | null>(null);

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

  useLayoutEffect(() => {
    if (!open || !constrainToViewport) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const anchor = panel?.offsetParent;
    if (!trigger || !panel || !(anchor instanceof HTMLElement)) return;

    const update = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const gutter = 8;
      let boundaryLeft = gutter;
      let boundaryRight = document.documentElement.clientWidth - gutter;
      let boundaryTop = gutter;
      let boundaryBottom = document.documentElement.clientHeight - gutter;
      // Vertical scroll containers also clip horizontal overflow in CSS. Bound the panel to
      // every clipping ancestor so an inline calendar never creates a modal scrollbar.
      for (let ancestor = anchor.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
        const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const rect = ancestor.getBoundingClientRect();
        const clientLeft = rect.left + ancestor.clientLeft;
        if (clipsX) {
          boundaryLeft = Math.max(boundaryLeft, clientLeft + gutter);
          boundaryRight = Math.min(boundaryRight, clientLeft + ancestor.clientWidth - gutter);
        }
        if (clipsY) {
          const clientTop = rect.top + ancestor.clientTop;
          boundaryTop = Math.max(boundaryTop, clientTop + gutter);
          boundaryBottom = Math.min(boundaryBottom, clientTop + ancestor.clientHeight - gutter);
        }
      }
      const next = constrainedPopoverPosition({
        anchorLeft: triggerRect.left,
        anchorRight: triggerRect.right,
        panelWidth: panel.offsetWidth,
        boundaryLeft, boundaryRight, align,
        direction: getComputedStyle(trigger).direction === 'rtl' ? 'rtl' : 'ltr',
      });
      const vertical = constrainedPopoverVerticalPosition({
        anchorTop: triggerRect.top, anchorBottom: triggerRect.bottom,
        panelHeight: panel.scrollHeight + panel.offsetHeight - panel.clientHeight,
        boundaryTop, boundaryBottom, placement,
      });
      // The trigger normally fills its anchor, but keep offsets correct for narrower triggers.
      const adjusted = {
        ...next, ...vertical,
        left: next.left + triggerRect.left - anchorRect.left,
        top: vertical.top + triggerRect.top - anchorRect.top,
      };
      setPosition((current) => current?.left === adjusted.left && current.top === adjusted.top
        && current.maxWidth === adjusted.maxWidth && current.maxHeight === adjusted.maxHeight ? current : adjusted);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(panel);
    observer?.observe(anchor);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    document.addEventListener('animationend', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
      document.removeEventListener('animationend', update, true);
    };
  }, [open, constrainToViewport, align, placement]);

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
          onKeyDown={constrainToViewport ? (event) => {
            if (event.key !== 'Escape') return;
            // Consume Escape before an enclosing modal's document listener dismisses it.
            event.preventDefault();
            event.stopPropagation();
            close();
          } : undefined}
          style={constrainToViewport ? {
            left: position?.left ?? 0, right: 'auto', top: position?.top ?? 0, bottom: 'auto',
            maxWidth: position?.maxWidth, maxHeight: position?.maxHeight, overflowY: 'auto',
          } : undefined}
          className={cn(
            'surface-floating absolute z-popover min-w-56 animate-scale-in p-1.5 outline-none',
            placement === 'bottom' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]',
            !constrainToViewport && alignClass,
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
