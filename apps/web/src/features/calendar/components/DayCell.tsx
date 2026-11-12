'use client';

import { type KeyboardEvent } from 'react';
import type { CalendarCell } from '@taskin/jalali';
import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import {
formatJalali,toPersianDigits
} from '@taskin/jalali';
import { Popover,type PopoverProps } from '@/components/ui';
import { AddIcon } from '@/components/icons';
import { CalendarBadge,itemDotClass } from '@/features/calendar/components/calendar-item';
import { DaySummary } from '@/features/calendar/components/DaySummary';


/** At most this many badges per day; the rest fold into "+X مورد دیگر". */
const MAX_VISIBLE = 2;

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

export function DayCell({
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
