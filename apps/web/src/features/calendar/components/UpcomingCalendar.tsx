'use client';

import { useMemo } from 'react';
import { type CalendarItem } from '@/store/selectors';
import { addDays, daysBetween, formatJalali, fromISODate, toISODate } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ItemIcon,
  itemKindLabel,
  itemTimeLabel,
  itemTitle,
  itemTone,
} from '@/features/calendar/components/calendar-item';
import { Badge } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { CalendarIcon } from '@/components/icons';

/** How far ahead the side panel looks. */
const UPCOMING_DAYS = 14;

interface UpcomingPanelProps {
  readonly itemsByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  readonly today: Date;
  readonly onOpenTask: (taskId: string) => void;
}

/** Overdue deadlines, then the next two weeks day by day. */
export function UpcomingPanel({ itemsByDate, today, onOpenTask }: UpcomingPanelProps) {
  const todayIso = toISODate(today);

  const overdue = useMemo(() => {
    const list: CalendarItem[] = [];
    for (const [date, items] of itemsByDate) {
      if (daysBetween(today, fromISODate(date)) < 0)
        list.push(...items.filter((item) => item.kind === 'deadline'));
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [itemsByDate, today]);

  const days = useMemo(
    () =>
      Array.from({ length: UPCOMING_DAYS }, (_, offset) => addDays(todayIso, offset))
        .map((date) => ({ date, items: itemsByDate.get(date) ?? [] }))
        .filter((day) => day.items.length > 0),
    [itemsByDate, todayIso],
  );

  const relativeDay = (date: string): string => {
    const delta = daysBetween(today, fromISODate(date));
    if (delta === 0) return 'امروز';
    if (delta === 1) return 'فردا';
    return formatJalali(date, 'long');
  };

  return (
    <aside aria-labelledby="upcoming-title" className="flex flex-col gap-4">
      <h2 id="upcoming-title" className="text-title font-bold text-fg-primary">
        پیش رو
      </h2>

      {overdue.length > 0 && (
        <section aria-label="دارای تأخیر" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-caption font-semibold text-status-blocked">
            دارای تأخیر
            <Badge tone="blocked" size="sm" numeric>
              {formatCount(overdue.length)}
            </Badge>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {overdue.map((item) => (
              <UpcomingRow key={item.id} item={item} today={today} onOpenTask={onOpenTask} showDate />
            ))}
          </ul>
        </section>
      )}

      {days.length === 0 ? (
        <EmptyState
          compact
          icon={<CalendarIcon size={20} />}
          title="دو هفته آینده خالی است"
          description="مهلت یا رویدادی در این بازه ثبت نشده است."
        />
      ) : (
        days.map((day) => (
          <section key={day.date} aria-label={relativeDay(day.date)} className="flex flex-col gap-2">
            <h3 className="text-caption font-semibold text-fg-secondary numeric">{relativeDay(day.date)}</h3>
            <ul className="flex flex-col gap-1.5">
              {day.items.map((item) => (
                <UpcomingRow key={item.id} item={item} today={today} onOpenTask={onOpenTask} />
              ))}
            </ul>
          </section>
        ))
      )}
    </aside>
  );
}

interface UpcomingRowProps {
  readonly item: CalendarItem;
  readonly today: Date;
  readonly onOpenTask: (taskId: string) => void;
  readonly showDate?: boolean;
}

function UpcomingRow({ item, today, onOpenTask, showDate = false }: UpcomingRowProps) {
  const meta = [
    itemKindLabel(item),
    itemTimeLabel(item),
    showDate ? formatJalali(item.date, 'day-month') : null,
  ]
    .filter(Boolean)
    .join('، ');
  const content = (
    <>
      <span
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', itemTone(item, today))}
      >
        <ItemIcon item={item} size={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm font-semibold text-fg-primary">{itemTitle(item)}</span>
        <span className="truncate text-micro text-fg-tertiary numeric">{meta}</span>
      </span>
    </>
  );

  const className =
    'flex w-full items-center gap-3 rounded-xl border border-secondary bg-surface p-2.5 text-start shadow-xs transition-colors';

  return (
    <li>
      {item.kind === 'deadline' ? (
        <button
          type="button"
          onClick={() => onOpenTask(item.task.id)}
          className={cn(className, 'hover:border-brand')}
        >
          {content}
        </button>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}
