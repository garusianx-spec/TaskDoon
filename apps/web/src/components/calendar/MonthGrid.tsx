'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CalendarCell } from '@taskin/jalali';
import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import {
  JALALI_WEEKDAYS,
  JALALI_WEEKDAYS_SHORT,
  addDays,
  formatJalali,
  fromISODate,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  shiftJalaliMonth,
  toISODate,
  toPersianDigits,
} from '@taskin/jalali';
import { Popover, type PopoverProps } from '@/components/ui';
import { AddIcon } from '@/components/icons';
import { CalendarBadge, itemDotClass } from './calendar-item';
import { DaySummary } from './DaySummary';

/** At most this many badges per day; the rest fold into "+X مورد دیگر". */
const MAX_VISIBLE = 2;

/** Same day-of-month in the neighbouring Jalali month, clamped (31 Shahrivar → 30 Mehr). */
function shiftMonthKeepingDay(iso: string, delta: number): string {
  const { year, month, day } = gregorianToJalali(fromISODate(iso));
  const target = shiftJalaliMonth(year, month, delta);
  const clamped = Math.min(day, jalaliMonthLength(target.year, target.month));
  return toISODate(jalaliToGregorian(target.year, target.month, clamped));
}

export interface MonthGridProps {
  readonly cells: readonly CalendarCell[];
  readonly itemsByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  readonly today: Date;
  /** The one cell in the tab order (roving tabindex). */
  readonly focusedIso: string;
  /** Moves the roving focus; the page switches month when the date falls outside this one. */
  readonly onFocusDate: (iso: string) => void;
  readonly onCreateTask: (iso: string) => void;
  readonly onCreateEvent: (iso: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

/**
 * Minimal Jalali month grid, Saturday-first. Every cell is a stretched button that opens the
 * task composer with that day as the deadline; on top of it sit at most two compact badges
 * and a "+X مورد دیگر" chip that opens the day summary. Phone widths swap badges for dots.
 *
 * Keyboard: arrows move by day/week (ArrowLeft is the next day in RTL), Home/End jump to the
 * week's edges, PageUp/PageDown change month, Enter/Space create a task on the focused day.
 */
export function MonthGrid({
  cells,
  itemsByDate,
  today,
  focusedIso,
  onFocusDate,
  onCreateTask,
  onCreateEvent,
  onOpenTask,
  onToggleComplete,
}: MonthGridProps) {
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [focusRequest, setFocusRequest] = useState(0);

  const weeks = useMemo(
    () => Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => cells.slice(row * 7, row * 7 + 7)),
    [cells],
  );

  // Runs after the month has re-rendered, so a keyboard move into next month lands on a
  // button that exists.
  useEffect(() => {
    if (focusRequest > 0) buttons.current.get(focusedIso)?.focus();
  }, [focusRequest, focusedIso, cells]);

  const moveTo = (iso: string) => {
    onFocusDate(iso);
    setFocusRequest((count) => count + 1);
  };

  const onCellKeyDown = (cell: CalendarCell) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const byDay: Readonly<Record<string, number>> = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 };
    const days = byDay[event.key];
    if (days !== undefined) {
      event.preventDefault();
      moveTo(addDays(cell.iso, days));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(addDays(cell.iso, event.key === 'Home' ? -cell.weekdayIndex : 6 - cell.weekdayIndex));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveTo(shiftMonthKeepingDay(cell.iso, event.key === 'PageDown' ? 1 : -1));
    }
  };

  return (
    <div role="grid" aria-label="تقویم ماهانه هجری شمسی" className="flex flex-col">
      <div role="row" className="grid grid-cols-7 border-b border-secondary">
        {JALALI_WEEKDAYS_SHORT.map((short, index) => (
          <div
            key={short}
            role="columnheader"
            aria-label={JALALI_WEEKDAYS[index]}
            className={cn(
              'flex h-9 items-center justify-center text-caption font-semibold',
              index === 6 ? 'text-status-blocked' : 'text-fg-quaternary',
            )}
          >
            <span className="sm:hidden" aria-hidden="true">
              {short}
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              {JALALI_WEEKDAYS[index]}
            </span>
          </div>
        ))}
      </div>

      {weeks.map((week, row) => (
        <div role="row" key={week[0]?.iso ?? row} className="grid grid-cols-7">
          {week.map((cell) => (
            <DayCell
              key={cell.iso}
              cell={cell}
              items={itemsByDate.get(cell.iso) ?? []}
              today={today}
              focusable={cell.iso === focusedIso}
              // Keep the summary popover on-screen: open upward from the bottom half, and
              // away from whichever inline edge the column sits on.
              placement={row >= 3 ? 'top' : 'bottom'}
              align={cell.weekdayIndex <= 3 ? 'start' : 'end'}
              registerButton={(node) => {
                if (node) buttons.current.set(cell.iso, node);
                else buttons.current.delete(cell.iso);
              }}
              onKeyDown={onCellKeyDown(cell)}
              onFocus={() => onFocusDate(cell.iso)}
              onCreateTask={onCreateTask}
              onCreateEvent={onCreateEvent}
              onOpenTask={onOpenTask}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface DayCellProps {
  readonly cell: CalendarCell;
  readonly items: readonly CalendarItem[];
  readonly today: Date;
  readonly focusable: boolean;
  readonly placement: NonNullable<PopoverProps['placement']>;
  readonly align: NonNullable<PopoverProps['align']>;
  readonly registerButton: (node: HTMLButtonElement | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: () => void;
  readonly onCreateTask: (iso: string) => void;
  readonly onCreateEvent: (iso: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

function DayCell({
  cell,
  items,
  today,
  focusable,
  placement,
  align,
  registerButton,
  onKeyDown,
  onFocus,
  onCreateTask,
  onCreateEvent,
  onOpenTask,
  onToggleComplete,
}: DayCellProps) {
  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;
  const isFriday = cell.weekdayIndex === 6;

  const summary = (close: () => void) => (
    <DaySummary
      date={cell.iso}
      items={items}
      today={today}
      onOpenTask={(taskId) => {
        close();
        onOpenTask(taskId);
      }}
      onToggleComplete={onToggleComplete}
      onCreateTask={() => {
        close();
        onCreateTask(cell.iso);
      }}
      onCreateEvent={() => {
        close();
        onCreateEvent(cell.iso);
      }}
    />
  );

  // Uncontrolled on purpose: each trigger (event badge, overflow chip, phone dots) owns its
  // own open state, so opening one never opens the others.
  const popoverProps = {
    label: `برنامه ${formatJalali(cell.iso, 'long')}`,
    placement,
    align,
    panelClassName: 'min-w-0 p-2',
  } as const;

  return (
    <div
      role="gridcell"
      className={cn(
        'group/cell relative flex min-h-16 min-w-0 flex-col gap-1 border-b border-e border-tertiary p-1 sm:min-h-28 sm:p-1.5',
        !cell.inCurrentMonth && 'bg-sunken/50',
      )}
    >
      {/* Stretched activator: the whole cell creates a task due on this day. */}
      <button
        ref={registerButton}
        type="button"
        tabIndex={focusable ? 0 : -1}
        aria-current={cell.isToday ? 'date' : undefined}
        aria-label={`${formatJalali(cell.iso, 'long')}${items.length ? `، ${formatCount(items.length)} مورد` : ''} — ایجاد وظیفه با این مهلت`}
        onClick={() => onCreateTask(cell.iso)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className="absolute inset-0 rounded-md transition-colors hover:bg-hover focus-visible:ring-inset focus-visible:ring-offset-0"
      />

      <span className="pointer-events-none relative flex items-center justify-between">
        <span
          className={cn(
            'numeric flex size-7 items-center justify-center rounded-full text-body-sm font-semibold',
            cell.isToday && 'bg-brand-solid text-fg-on-brand',
            !cell.isToday && !cell.inCurrentMonth && 'text-fg-disabled',
            !cell.isToday && cell.inCurrentMonth && isFriday && 'text-status-blocked',
            !cell.isToday && cell.inCurrentMonth && !isFriday && 'text-fg-primary',
          )}
        >
          {toPersianDigits(cell.jalali.day)}
        </span>
        <AddIcon
          size={14}
          className="hidden text-fg-quaternary opacity-0 transition-opacity group-hover/cell:opacity-100 sm:block"
        />
      </span>

      {/* ≥ sm: up to two badges, then the overflow chip. */}
      <div className="hidden min-w-0 flex-col gap-1 sm:flex">
        {visible.map((item) =>
          item.kind === 'deadline' ? (
            <CalendarBadge key={item.id} item={item} today={today} onClick={() => onOpenTask(item.task.id)} />
          ) : (
            <Popover key={item.id} {...popoverProps} className="w-full" trigger={<CalendarBadge item={item} today={today} />}>
              {summary}
            </Popover>
          ),
        )}
        {hidden > 0 && (
          <Popover
            {...popoverProps}
            trigger={
              <button
                type="button"
                className="relative z-10 flex h-5 items-center rounded-md px-1.5 text-micro font-semibold text-fg-tertiary transition-colors hover:bg-active hover:text-fg-primary"
              >
                <span className="numeric">{`+${toPersianDigits(hidden)} مورد دیگر`}</span>
              </button>
            }
          >
            {summary}
          </Popover>
        )}
      </div>

      {/* Phone width: dots, and the whole dot strip opens the day summary. */}
      {items.length > 0 && (
        <Popover
          {...popoverProps}
          className="self-center sm:hidden"
          trigger={
            <button
              type="button"
              aria-label={`${formatCount(items.length)} مورد در ${formatJalali(cell.iso, 'long')}`}
              className="relative z-10 flex items-center gap-0.5 rounded-full px-1 py-0.5"
            >
              {visible.map((item) => (
                <span key={item.id} className={cn('size-1.5 rounded-full', itemDotClass(item, today))} aria-hidden="true" />
              ))}
              {hidden > 0 && (
                <span className="numeric text-[0.625rem] font-semibold leading-none text-fg-tertiary" aria-hidden="true">
                  {`+${toPersianDigits(hidden)}`}
                </span>
              )}
            </button>
          }
        >
          {summary}
        </Popover>
      )}
    </div>
  );
}
