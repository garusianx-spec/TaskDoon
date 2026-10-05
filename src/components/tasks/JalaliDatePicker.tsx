'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  JALALI_WEEKDAYS,
  JALALI_WEEKDAYS_MEDIUM,
  buildMonthGrid,
  formatJalali,
  gregorianToJalali,
  parseISODate,
  shiftJalaliMonth,
  toPersianDigits,
} from '@/lib/jalali';
import { Button, Popover } from '@/components/ui';
import { CalendarIcon, ChevronBackwardIcon, ChevronForwardIcon } from '@/components/icons';

export interface JalaliDatePickerProps {
  readonly value: string;
  readonly onChange: (iso: string) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * Jalali month picker.
 *
 * The grid is a `role="grid"` of `gridcell` buttons, Saturday-first. Arrow keys move by one
 * day / one week, PageUp/PageDown by one month, and the month header announces the change.
 * "هفته قبل" navigation in RTL means ArrowRight moves to the previous day.
 */
export function JalaliDatePicker({ value, onChange, label, disabled = false }: JalaliDatePickerProps) {
  const selected = useMemo(() => gregorianToJalali(parseISODate(value)), [value]);
  const [cursor, setCursor] = useState({ year: selected.year, month: selected.month });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, new Date()),
    [cursor.year, cursor.month],
  );

  const monthLabel = useMemo(() => {
    const first = cells.find((cell) => cell.inCurrentMonth);
    return first ? formatJalali(first.iso, 'month-year') : '';
  }, [cells]);

  const step = (delta: number) => {
    const next = shiftJalaliMonth(cursor.year, cursor.month, delta);
    setCursor({ year: next.year, month: next.month });
  };

  return (
    <Popover
      label={label}
      align="start"
      panelClassName="min-w-0 p-3"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-lg border border-primary bg-surface px-3 text-start text-body-sm shadow-xs transition-colors',
            'hover:bg-hover disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-disabled',
          )}
        >
          <CalendarIcon size={18} className="shrink-0 text-fg-quaternary" />
          <span className="numeric flex-1 truncate font-medium text-fg-primary">
            {formatJalali(value, 'medium')}
          </span>
        </button>
      }
    >
      {(close) => (
        <div className="w-72">
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="ماه قبل"
              className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-hover"
            >
              <ChevronBackwardIcon size={18} />
            </button>
            <span aria-live="polite" className="numeric text-title-sm font-semibold text-fg-primary">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="ماه بعد"
              className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-hover"
            >
              <ChevronForwardIcon size={18} />
            </button>
          </div>

          <div role="grid" aria-label={label} className="grid grid-cols-7 gap-0.5">
            {JALALI_WEEKDAYS_MEDIUM.map((day, index) => (
              <div
                key={day}
                role="columnheader"
                aria-label={JALALI_WEEKDAYS[index]}
                className="flex h-8 items-center justify-center text-micro font-semibold text-fg-quaternary"
              >
                {day}
              </div>
            ))}

            {cells.map((cell) => {
              const isSelected = cell.iso === value;
              const isWeekend = cell.weekdayIndex === 6;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={cell.isToday ? 'date' : undefined}
                  aria-label={formatJalali(cell.iso, 'long')}
                  tabIndex={isSelected ? 0 : -1}
                  onKeyDown={(event) => {
                    const deltas: Readonly<Record<string, number>> = {
                      ArrowLeft: 1,
                      ArrowRight: -1,
                      ArrowDown: 7,
                      ArrowUp: -7,
                    };
                    const delta = deltas[event.key];
                    if (delta !== undefined) {
                      event.preventDefault();
                      const index = cells.findIndex((entry) => entry.iso === cell.iso);
                      const target = cells[index + delta];
                      if (target) {
                        onChange(target.iso);
                        if (!target.inCurrentMonth) {
                          const next = gregorianToJalali(parseISODate(target.iso));
                          setCursor({ year: next.year, month: next.month });
                        }
                      }
                      return;
                    }
                    if (event.key === 'PageDown') {
                      event.preventDefault();
                      step(1);
                    } else if (event.key === 'PageUp') {
                      event.preventDefault();
                      step(-1);
                    }
                  }}
                  onClick={() => {
                    onChange(cell.iso);
                    close();
                  }}
                  className={cn(
                    'numeric flex h-9 items-center justify-center rounded-lg text-body-sm font-medium transition-colors',
                    !cell.inCurrentMonth && 'text-fg-disabled',
                    cell.inCurrentMonth && !isSelected && 'text-fg-primary hover:bg-hover',
                    isWeekend && cell.inCurrentMonth && !isSelected && 'text-status-blocked',
                    cell.isToday && !isSelected && 'ring-1 ring-brand',
                    isSelected && 'bg-brand-solid text-fg-on-brand',
                  )}
                >
                  {toPersianDigits(cell.jalali.day)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              fullWidth
              onClick={() => {
                const today = new Date();
                const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                onChange(iso);
                const jalali = gregorianToJalali(today);
                setCursor({ year: jalali.year, month: jalali.month });
                close();
              }}
            >
              امروز
            </Button>
            <Button size="sm" variant="tertiary" fullWidth onClick={close}>
              تایید
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
