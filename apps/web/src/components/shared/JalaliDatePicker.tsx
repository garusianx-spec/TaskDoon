'use client';

import { useState } from 'react';
import { formatCalendarDate, shiftCalendarMonth, toISODate, type CalendarSystem } from '@taskin/jalali';
import { cn } from '@/lib/utils';
import { Button, Popover } from '@/components/ui';
import { CalendarIcon } from '@/components/icons';
import { CalendarDateText } from '@/features/calendar/components/CalendarDateText';
import { CalendarMonthNavigation } from '@/features/calendar/components/CalendarMonthNavigation';
import { CalendarPickerGrid } from '@/features/calendar/components/CalendarPickerGrid';
import { CalendarSystemToggle } from '@/features/calendar/components/CalendarSystemToggle';
import { useCalendarGrid } from '@/features/calendar/hooks/useCalendarGrid';
import { useCalendarPreference } from '@/features/calendar/hooks/useCalendarPreference';

export interface JalaliDatePickerProps {
  readonly value: string | null;
  readonly onChange: (iso: string) => void;
  readonly onClear?: () => void;
  readonly label: string;
  readonly emptyLabel?: string;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly timeZone?: string;
  readonly disabled?: boolean;
}

/** Date-only field with a shared calendar preference and a Gregorian ISO value. */
export function JalaliDatePicker({
  value,
  onChange,
  onClear,
  label,
  emptyLabel = 'انتخاب تاریخ',
  describedBy,
  invalid,
  timeZone,
  disabled = false,
}: JalaliDatePickerProps) {
  const { system, setCalendarSystem } = useCalendarPreference();
  const [anchorIso, setAnchorIso] = useState<string | null>(null);
  const valueIso = value?.slice(0, 10) ?? null;
  const today = () => toISODate(new Date(), timeZone);

  return (
    <Popover
      label={label}
      align="start"
      className="w-full min-w-0"
      panelClassName="w-96 min-w-0 px-1 py-3 scrollbar-thin sm:px-1.5"
      constrainToViewport
      onOpenChange={(open) => {
        if (open) setAnchorIso(valueIso ?? today());
      }}
      trigger={
        <Button
          aria-label={label}
          aria-describedby={describedBy}
          disabled={disabled}
          size="lg"
          variant="secondary"
          fullWidth
          className={cn(
            'justify-start gap-2 px-3 text-start text-body-sm sm:h-10',
            invalid && 'border-error-300',
          )}
          iconStart={<CalendarIcon size={18} className="shrink-0 text-fg-quaternary" />}
        >
          <span className="min-w-0 flex-1 truncate font-medium text-fg-primary">
            {valueIso ? (
              <CalendarDateText system={system}>
                {formatCalendarDate(system, valueIso, 'medium')}
              </CalendarDateText>
            ) : (
              emptyLabel
            )}
          </span>
        </Button>
      }
    >
      {(close) => {
        const select = (iso: string) => {
          onChange(iso);
          close();
        };
        const todayIso = today();
        return (
          <DatePickerCalendar
            label={label}
            system={system}
            setCalendarSystem={setCalendarSystem}
            value={valueIso}
            anchorIso={anchorIso ?? valueIso ?? todayIso}
            todayIso={todayIso}
            onNavigate={setAnchorIso}
            onChange={onChange}
            onSelect={select}
            onClear={
              onClear && valueIso
                ? () => {
                    onClear();
                    close();
                  }
                : undefined
            }
            onClose={close}
          />
        );
      }}
    </Popover>
  );
}

interface DatePickerCalendarProps {
  readonly label: string;
  readonly system: CalendarSystem;
  readonly setCalendarSystem: (system: CalendarSystem) => void;
  readonly value: string | null;
  readonly anchorIso: string;
  readonly todayIso: string;
  readonly onNavigate: (iso: string) => void;
  readonly onChange: (iso: string) => void;
  readonly onSelect: (iso: string) => void;
  readonly onClear?: () => void;
  readonly onClose: () => void;
}

function DatePickerCalendar({
  label,
  system,
  setCalendarSystem,
  value,
  anchorIso,
  todayIso,
  onNavigate,
  onChange,
  onSelect,
  onClear,
  onClose,
}: DatePickerCalendarProps) {
  const grid = useCalendarGrid(system, anchorIso, todayIso);
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex justify-center">
        <CalendarSystemToggle system={system} onChange={setCalendarSystem} />
      </div>
      <CalendarMonthNavigation
        system={system}
        monthLabel={grid.monthLabel}
        onStep={(delta) => onNavigate(shiftCalendarMonth(system, anchorIso, delta))}
      />
      <CalendarPickerGrid
        system={system}
        grid={grid}
        label={label}
        focusedIso={anchorIso}
        value={value}
        onNavigate={(iso, select) => {
          onNavigate(iso);
          if (select) onChange(iso);
        }}
        onSelect={onSelect}
      />
      <div className="flex gap-1">
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          className="min-w-0 px-2"
          onClick={() => onSelect(todayIso)}
        >
          امروز
        </Button>
        {onClear && (
          <Button size="lg" variant="tertiary" fullWidth className="min-w-0 px-2" onClick={onClear}>
            حذف مهلت
          </Button>
        )}
        <Button size="lg" variant="tertiary" fullWidth className="min-w-0 px-2" onClick={onClose}>
          تایید
        </Button>
      </div>
    </div>
  );
}
