'use client';

import { cn } from '@/lib/cn';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { useNamespacedId } from '@/hooks/useId';
import type { ReactNode } from 'react';

export interface SegmentOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly count?: string;
  readonly icon?: ReactNode;
}

export interface SegmentedControlProps<TValue extends string> {
  readonly options: ReadonlyArray<SegmentOption<TValue>>;
  readonly value: TValue;
  readonly onValueChange: (value: TValue) => void;
  readonly ariaLabel: string;
  readonly size?: 'sm' | 'md';
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/**
 * Tablist-flavoured segmented control (`role="tablist"` with manual activation avoided —
 * arrow keys move focus *and* selection, which is the expected behaviour for a filter).
 * Arrow direction is resolved from the computed `dir` by `useRovingFocus`.
 */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  size = 'sm',
  fullWidth = false,
  className,
}: SegmentedControlProps<TValue>) {
  const baseId = useNamespacedId('segmented-');
  const { registerItem, onKeyDown } = useRovingFocus(options.length, 'horizontal', {
    onActivate: (index) => {
      const option = options[index];
      if (option) onValueChange(option.value);
    },
  });

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg bg-sunken p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={registerItem(index)}
            id={`${baseId}-${option.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-9 px-3 text-title-sm',
              selected
                ? 'bg-surface text-fg-primary shadow-xs'
                : 'text-fg-tertiary hover:text-fg-secondary',
            )}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'numeric rounded-full px-1.5 text-micro font-semibold',
                  selected ? 'bg-brand-subtle text-fg-brand' : 'bg-muted text-fg-tertiary',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
