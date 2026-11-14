'use client';

import { type KeyboardEvent } from 'react';
import type { CalendarGridCell, CalendarSystem } from '@taskin/jalali';
import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { formatCalendarDate, toPersianDigits } from '@taskin/jalali';
import { CalendarDateText } from './CalendarDateText';
import { Popover, type PopoverProps } from '@/components/ui';
import { AddIcon } from '@/components/icons';
import { CalendarBadge, itemDotClass } from '@/features/calendar/components/calendar-item';
import { DaySummary } from '@/features/calendar/components/DaySummary';

/** At most this many badges per day; the rest fold into "+X مورد دیگر". */
const MAX_VISIBLE = 2;

interface DayCellProps {
  readonly cell: CalendarGridCell;
  readonly system: CalendarSystem;
  readonly items: readonly CalendarItem[];
  readonly today: Date;
  readonly focusable: boolean;
  readonly placement: NonNullable<PopoverProps['placement']>;
  readonly align: NonNullable<PopoverProps['align']>;
  readonly onSelect: (iso: string) => void;
  readonly registerButton: (node: HTMLButtonElement | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onCreateTask: (iso: string) => void;
  readonly onCreateEvent: (iso: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

export function DayCell({
  cell,
  system,
  items,
  today,
  focusable,
  placement,
  align,
  onSelect,
  registerButton,
  onKeyDown,
  onCreateTask,
  onCreateEvent,
  onOpenTask,
  onToggleComplete,
}: DayCellProps) {
  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = items.length - visible.length;
  const isFriday = cell.weekdayIndex === 6;
  const dateLabel = formatCalendarDate(system, cell.iso, 'long');

  const summary = (close: () => void) => (
    <DaySummary
      date={cell.iso}
      system={system}
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
    label: `برنامه ${dateLabel}`,
    placement,
    align,
    panelClassName: 'min-w-0 w-80 p-2',
    constrainToViewport: true,
  } as const;

  return (
    <div
      role="gridcell"
      aria-selected={focusable}
      className={cn(
        'group/cell relative flex h-24 min-w-0 flex-col gap-1 border-b border-e border-tertiary p-1 sm:h-32 sm:p-1.5',
        !cell.inCurrentMonth && 'bg-sunken/50',
      )}
    >
      {/* Stretched activator: the whole cell creates a task due on this day. */}
      <button
        ref={registerButton}
        type="button"
        tabIndex={focusable ? 0 : -1}
        aria-current={cell.isToday ? 'date' : undefined}
        aria-label={`${dateLabel}${items.length ? `، ${formatCount(items.length)} مورد` : ''} — ایجاد وظیفه با این مهلت`}
        onClick={() => {
          onSelect(cell.iso);
          onCreateTask(cell.iso);
        }}
        onKeyDown={onKeyDown}
        className="absolute inset-0 rounded-md transition-colors hover:bg-hover focus-visible:ring-inset focus-visible:ring-offset-0"
      />

      <span className="pointer-events-none relative flex items-center justify-between">
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full text-body-sm font-semibold',
            cell.isToday && 'bg-brand-solid text-fg-on-brand',
            focusable && !cell.isToday && 'bg-brand-subtle text-fg-brand ring-1 ring-brand',
            !focusable && !cell.isToday && !cell.inCurrentMonth && 'text-fg-disabled',
            !focusable && !cell.isToday && cell.inCurrentMonth && isFriday && 'text-status-blocked',
            !focusable && !cell.isToday && cell.inCurrentMonth && !isFriday && 'text-fg-primary',
          )}
        >
          <CalendarDateText system={system}>
            {system === 'jalali' ? toPersianDigits(cell.day.day) : cell.day.day}
          </CalendarDateText>
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
            <Popover
              key={item.id}
              {...popoverProps}
              className="w-full"
              trigger={<CalendarBadge item={item} today={today} />}
            >
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
                aria-label={`${formatCount(hidden)} مورد دیگر در ${dateLabel}`}
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
              aria-label={`${formatCount(items.length)} مورد در ${dateLabel}`}
              className="relative z-10 flex size-11 items-center justify-center gap-0.5 rounded-lg"
            >
              {visible.map((item) => (
                <span
                  key={item.id}
                  className={cn('size-1.5 rounded-full', itemDotClass(item, today))}
                  aria-hidden="true"
                />
              ))}
              {hidden > 0 && (
                <span
                  className="text-micro font-semibold leading-none text-fg-tertiary numeric"
                  aria-hidden="true"
                >
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
