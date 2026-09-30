'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useNamespacedId } from '@/hooks/useId';
import { useRovingFocus } from '@/hooks/useRovingFocus';

export interface TabItem<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  /** Rendered as a pill after the label; pass the already-formatted (Persian-digit) count. */
  readonly count?: string;
  readonly icon?: ReactNode;
}

export interface TabsProps<TValue extends string> {
  readonly items: ReadonlyArray<TabItem<TValue>>;
  readonly value: TValue;
  readonly onValueChange: (value: TValue) => void;
  readonly ariaLabel: string;
  /** The active panel's content. */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Untitled UI underline tabs: a compact `tablist` whose selected tab carries a brand
 * underline, wired to a single `tabpanel`. Arrow keys follow the reading direction (via
 * `useRovingFocus`) and activate as they move, and the list scrolls sideways rather than
 * wrapping when a narrow column cannot fit every label.
 */
export function Tabs<TValue extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  children,
  className,
}: TabsProps<TValue>) {
  const baseId = useNamespacedId('tabs-');
  const { registerItem, onKeyDown } = useRovingFocus(items.length, 'horizontal', {
    onActivate: (index) => {
      const item = items[index];
      if (item) onValueChange(item.value);
    },
  });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="no-scrollbar -mb-px flex gap-3 overflow-x-auto border-b border-secondary"
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={registerItem(index)}
              id={`${baseId}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 text-caption font-semibold transition-colors',
                selected
                  ? 'border-brand text-fg-brand'
                  : 'border-transparent text-fg-tertiary hover:border-primary hover:text-fg-secondary',
              )}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    'numeric rounded-full px-1.5 text-micro font-semibold leading-5',
                    selected ? 'bg-brand-subtle text-fg-brand' : 'bg-sunken text-fg-tertiary',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${value}`}
        tabIndex={0}
        className="rounded-lg focus-visible:ring-offset-0"
      >
        {children}
      </div>
    </div>
  );
}
