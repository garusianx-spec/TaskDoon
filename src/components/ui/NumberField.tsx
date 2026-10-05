'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/jalali';
import { parseLocalisedNumber } from '@/lib/format';
import { IconButton } from './IconButton';
import { AddIcon, MinusIcon } from '@/components/icons';

export interface NumberFieldProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly className?: string;
}

/**
 * Integer field that reads and writes Persian digits.
 *
 * A native `type="number"` cannot render Persian numerals, so this is a text field with
 * `inputMode="numeric"` (which still raises the numeric keypad on mobile). While the field
 * has focus the raw string is kept locally so the user can clear it and retype; the
 * canonical clamped value is re-applied on blur. Steppers replace the lost native spinner
 * and give touch users a target.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  label,
  hideLabel = false,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.trunc(next)));
  const shown = draft ?? toPersianDigits(value);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className={cn('text-body-sm font-medium text-fg-secondary', hideLabel && 'sr-only')}>
        {label}
      </span>
      <div className="flex h-9 items-center gap-0.5 rounded-lg border border-primary bg-surface px-1 shadow-xs focus-within:border-brand">
        <IconButton
          label={`کاهش ${label}`}
          icon={<MinusIcon size={14} />}
          size="xs"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        />
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          aria-label={label}
          value={shown}
          onFocus={() => setDraft(toPersianDigits(value))}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = parseLocalisedNumber(event.target.value);
            if (parsed !== null) onChange(clamp(parsed));
          }}
          onBlur={() => setDraft(null)}
          className="numeric h-full min-w-0 flex-1 bg-transparent text-center text-body-sm text-fg-primary outline-none"
        />
        <IconButton
          label={`افزایش ${label}`}
          icon={<AddIcon size={14} />}
          size="xs"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
        />
      </div>
    </div>
  );
}
