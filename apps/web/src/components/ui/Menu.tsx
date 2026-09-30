'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface MenuItemProps {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly onSelect: () => void;
  readonly tone?: 'default' | 'danger';
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly className?: string;
}

/**
 * Menu row for use inside a `Popover` with `haspopup="menu"`. Arrow-key traversal is provided
 * by the parent `MenuList`; each row stays a real button so Enter/Space activate natively.
 */
export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { children, icon, shortcut, onSelect, tone = 'default', disabled = false, selected = false, className },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-body-sm font-medium transition-colors',
        tone === 'danger'
          ? 'text-status-blocked hover:bg-status-blocked-subtle'
          : 'text-fg-secondary hover:bg-hover hover:text-fg-primary',
        selected && 'bg-brand-subtle text-fg-brand',
        disabled && 'cursor-not-allowed text-fg-disabled hover:bg-transparent',
        className,
      )}
    >
      {icon && <span className="flex shrink-0 text-current">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="latin-inline text-micro text-fg-quaternary">{shortcut}</span>}
    </button>
  );
});

export interface MenuListProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Wraps menu rows and adds ArrowUp/ArrowDown/Home/End traversal over whatever
 * `role="menuitem"` children are currently rendered.
 */
export function MenuList({ children, className }: MenuListProps) {
  return (
    <div
      className={cn('flex flex-col gap-0.5', className)}
      onKeyDown={(event) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
        );
        if (items.length === 0) return;
        event.preventDefault();

        const currentIndex = items.findIndex((item) => item === document.activeElement);
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : event.key === 'ArrowDown'
                ? (currentIndex + 1 + items.length) % items.length
                : (currentIndex - 1 + items.length) % items.length;

        items[nextIndex]?.focus();
      }}
    >
      {children}
    </div>
  );
}
