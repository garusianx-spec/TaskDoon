'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { CalendarEventKind } from '@taskin/contracts';
import type { CalendarItem } from '@/store/selectors';
import { calendarEventKindLabel } from '@/data/reference';
import { cn } from '@/lib/cn';
import { daysBetween, fromISODate, toPersianDigits } from '@taskin/jalali';
import { CalendarIcon, FlagIcon, MilestoneIcon, NotificationIcon } from '@/components/icons';

/** Visual grammar shared by the month grid, the day summary and the upcoming list. */
export const EVENT_ICONS: Readonly<Record<CalendarEventKind, typeof CalendarIcon>> = {
  meeting: CalendarIcon,
  reminder: NotificationIcon,
  milestone: MilestoneIcon,
};

const EVENT_TONES: Readonly<Record<CalendarEventKind, string>> = {
  meeting: 'bg-brand-subtle text-fg-brand',
  reminder: 'bg-status-progress-subtle text-status-progress',
  milestone: 'bg-status-done-subtle text-status-done',
};

export function isOverdueDeadline(item: CalendarItem, today: Date): boolean {
  return item.kind === 'deadline' && daysBetween(today, fromISODate(item.date)) < 0;
}

/** Soft fill + ink pair for a badge or icon tile. */
export function itemTone(item: CalendarItem, today: Date): string {
  if (item.kind === 'event') return EVENT_TONES[item.event.kind];
  return isOverdueDeadline(item, today)
    ? 'bg-status-blocked-subtle text-status-blocked'
    : 'bg-sunken text-fg-secondary';
}

export function ItemIcon({ item, size }: { readonly item: CalendarItem; readonly size: number }) {
  if (item.kind === 'deadline') return <FlagIcon size={size} />;
  const Icon = EVENT_ICONS[item.event.kind];
  return <Icon size={size} />;
}

export function itemTitle(item: CalendarItem): string {
  return item.kind === 'deadline' ? item.task.title : item.event.title;
}

export function itemKindLabel(item: CalendarItem): string {
  return item.kind === 'deadline' ? 'مهلت وظیفه' : calendarEventKindLabel(item.event.kind);
}

export function itemTimeLabel(item: CalendarItem): string | null {
  if (item.kind === 'deadline' || !item.event.startTime) return null;
  const { startTime, endTime } = item.event;
  return toPersianDigits(endTime ? `${startTime} تا ${endTime}` : startTime);
}

/** Dot colour for the phone-width grid, where badges would not fit. */
export function itemDotClass(item: CalendarItem, today: Date): string {
  if (item.kind === 'deadline') return isOverdueDeadline(item, today) ? 'bg-status-blocked' : 'bg-gray-400';
  switch (item.event.kind) {
    case 'meeting':
      return 'bg-brand-solid';
    case 'reminder':
      return 'bg-status-progress';
    case 'milestone':
      return 'bg-status-done';
    default: {
      const exhaustive: never = item.event.kind;
      return exhaustive;
    }
  }
}

export interface CalendarBadgeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  readonly item: CalendarItem;
  readonly today: Date;
}

/**
 * Compact one-line badge used inside a month cell. Forwards its ref and ARIA props so it can
 * double as a `Popover` trigger (events open the day summary; deadlines open the task).
 */
export const CalendarBadge = forwardRef<HTMLButtonElement, CalendarBadgeProps>(function CalendarBadge(
  { item, today, ...rest },
  ref,
) {
  const time = item.kind === 'event' ? item.event.startTime : null;
  return (
    <button
      ref={ref}
      type="button"
      title={itemTitle(item)}
      aria-label={`${itemKindLabel(item)}: ${itemTitle(item)}${time ? `، ساعت ${toPersianDigits(time)}` : ''}`}
      className={cn(
        'relative z-10 flex h-5 w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-start text-micro font-medium',
        'transition-[filter] hover:brightness-95 dark:hover:brightness-125',
        itemTone(item, today),
      )}
      {...rest}
    >
      <ItemIcon item={item} size={11} />
      <span className="truncate">{itemTitle(item)}</span>
    </button>
  );
});
