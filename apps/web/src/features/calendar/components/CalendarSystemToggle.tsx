'use client';

import type { CalendarSystem } from '@taskin/jalali';
import { Button } from '@/components/ui';

interface CalendarSystemToggleProps {
  readonly system: CalendarSystem;
  readonly onChange: (system: CalendarSystem) => void;
}

const options = [
  { value: 'jalali', label: 'شمسی' },
  { value: 'gregorian', label: 'میلادی' },
] as const;

/** Switches the display calendar without changing the selected civil date. */
export function CalendarSystemToggle({ system, onChange }: CalendarSystemToggleProps) {
  return (
    <div
      role="group"
      aria-label="نوع تقویم"
      className="inline-grid grid-cols-2 gap-0.5 rounded-lg bg-sunken p-1"
    >
      {options.map(({ value, label }) => (
        <Button
          key={value}
          size="lg"
          variant={value === system ? 'secondary' : 'ghost'}
          aria-pressed={value === system}
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
