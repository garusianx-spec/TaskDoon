'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useNamespacedId } from '@/hooks/useId';
import { CheckIcon, MinusIcon } from '@/components/icons';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label?: ReactNode;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly size?: 'sm' | 'md';
  /** `success` paints the checked box green — used where checking means "completed". */
  readonly tone?: 'brand' | 'success';
  readonly className?: string;
}

/**
 * Untitled UI checkbox. Rendered as a `role="checkbox"` button so the tri-state
 * (`mixed`) is expressible, which a native input cannot do without JS anyway.
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    checked,
    indeterminate = false,
    onCheckedChange,
    label,
    ariaLabel,
    disabled = false,
    size = 'md',
    tone = 'brand',
    className,
  },
  ref,
) {
  const id = useNamespacedId('checkbox-');
  const labelId = `${id}-label`;
  const box = size === 'sm' ? 'size-4' : 'size-5';
  const glyph = size === 'sm' ? 12 : 14;

  const control = (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors duration-150',
        box,
        checked || indeterminate
          ? tone === 'success'
            ? 'border-success-600 bg-success-600 text-white'
            : 'border-brand bg-brand-solid text-fg-on-brand'
          : tone === 'success'
            ? 'border-primary bg-surface text-transparent hover:border-success-600 hover:bg-status-done-subtle'
            : 'border-primary bg-surface text-transparent hover:border-brand hover:bg-brand-subtle',
        disabled && 'cursor-not-allowed border-disabled bg-muted text-fg-disabled',
        className,
      )}
    >
      {indeterminate ? (
        <MinusIcon size={glyph} />
      ) : checked ? (
        <CheckIcon size={glyph} />
      ) : null}
    </button>
  );

  if (!label) return control;

  return (
    <span className="inline-flex items-center gap-2">
      {control}
      <span
        id={labelId}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          'cursor-pointer select-none text-body-sm text-fg-secondary',
          disabled && 'cursor-not-allowed text-fg-disabled',
        )}
      >
        {label}
      </span>
    </span>
  );
});
