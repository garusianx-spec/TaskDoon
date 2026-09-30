'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useNamespacedId } from '@/hooks/useId';
import { LockIcon, MinusIcon } from '@/components/icons';

export type SwitchSize = 'sm' | 'md';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  /** Accessible name. Required unless `labelledBy` points at visible text. */
  readonly label?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly disabled?: boolean;
  /** Renders a padlock instead of the knob — used for the immutable Owner role. */
  readonly locked?: boolean;
  readonly size?: SwitchSize;
  readonly className?: string;
  /** Mixed state for "some permissions in this row are on" master switches: off-end knob with a dash. */
  readonly indeterminate?: boolean;
}

const TRACK_SIZES: Readonly<Record<SwitchSize, string>> = {
  sm: 'h-5 w-9',
  md: 'h-6 w-11',
};

const KNOB_SIZES: Readonly<Record<SwitchSize, string>> = {
  sm: 'size-4',
  md: 'size-5',
};

/**
 * Untitled UI toggle built on the `switch` role rather than a checkbox, so screen readers
 * announce "on/off". Space and Enter both activate it (Enter is not native to buttons acting
 * as switches in every AT, so it is handled explicitly).
 *
 * In RTL the knob travels toward the start edge when on, which is handled by
 * `ltr:translate-x-*` / `rtl:-translate-x-*` rather than a transform override.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    checked,
    onCheckedChange,
    label,
    labelledBy,
    describedBy,
    disabled = false,
    locked = false,
    size = 'md',
    className,
    indeterminate = false,
  },
  ref,
) {
  const isDisabled = disabled || locked;

  // Knob travel = track width - knob width - borders. The knob only ever rests at an end:
  // on = the far end (left in RTL), off = the start end (right in RTL). A partially-granted
  // master switch (`mixed`) rests at the off end — clicking it grants everything — and says
  // "partial" with a tinted track and a dash in the knob instead of a thumb stranded mid-way.
  const knobTravel =
    checked && !indeterminate
      ? size === 'sm'
        ? 'ltr:translate-x-4 rtl:-translate-x-4'
        : 'ltr:translate-x-5 rtl:-translate-x-5'
      : 'translate-x-0';

  // A single ternary, not stacked conditionals: two competing `bg-*` utilities would be
  // resolved by stylesheet order rather than by intent.
  const trackTone = indeterminate ? 'bg-brand-300' : checked ? 'bg-brand-solid' : 'bg-gray-300';

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-readonly={locked || undefined}
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) return;
        onCheckedChange(!checked);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (isDisabled) return;
        onCheckedChange(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
        TRACK_SIZES[size],
        trackTone,
        isDisabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-flex items-center justify-center rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
          KNOB_SIZES[size],
          knobTravel,
        )}
      >
        {locked ? (
          <LockIcon size={size === 'sm' ? 10 : 12} className="text-gray-500" />
        ) : indeterminate ? (
          <MinusIcon size={size === 'sm' ? 10 : 12} className="text-brand-600" />
        ) : null}
      </span>
    </button>
  );
});

export interface SwitchFieldProps extends Omit<SwitchProps, 'label' | 'labelledBy'> {
  readonly title: string;
  readonly description?: ReactNode;
}

/** Switch paired with a visible title/description block, wired via `aria-labelledby`. */
export function SwitchField({ title, description, ...switchProps }: SwitchFieldProps) {
  const id = useNamespacedId('switch-field-');
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  return (
    <div className="flex items-start gap-3">
      <Switch {...switchProps} labelledBy={titleId} describedBy={description ? descId : undefined} />
      <div className="flex flex-col gap-0.5">
        <span id={titleId} className="text-body-sm font-semibold text-fg-primary">
          {title}
        </span>
        {description && (
          <span id={descId} className="text-caption text-fg-tertiary">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
