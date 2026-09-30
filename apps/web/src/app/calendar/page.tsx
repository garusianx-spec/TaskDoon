'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { calendarItemsByDate, type CalendarItem } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import {
  addDays,
  buildMonthGrid,
  daysBetween,
  formatJalali,
  fromISODate,
  gregorianToJalali,
  shiftJalaliMonth,
  toISODate,
} from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import {
  ItemIcon,
  itemKindLabel,
  itemTimeLabel,
  itemTitle,
  itemTone,
} from '@/components/calendar/calendar-item';
import { Badge, Button, EmptyState, IconButton } from '@/components/ui';
import {
  AddIcon,
  CalendarIcon,
  ChevronBackwardIcon,
  ChevronForwardIcon,
  FlagIcon,
  MilestoneIcon,
  NotificationIcon,
} from '@/components/icons';

/** How far ahead the side panel looks. */
const UPCOMING_DAYS = 14;

export default function CalendarPage() {
  return (
    <AppShell>
      <CalendarContent />
    </AppShell>
  );
}

/**
 * Deadlines, meetings and milestones only — notes live in their own module now. A day holds
 * at most two badges; everything else folds into the day summary, and a click anywhere on a
 * day starts a task due that day.
 */
function CalendarContent() {
  const { state, dispatch } = useWorkspace();
  const { open, openTaskComposer } = useOverlays();
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toISODate(today), [today]);
  const [focusedIso, setFocusedIso] = useState(todayIso);
  const [cursor, setCursor] = useState(() => {
    const jalali = gregorianToJalali(today);
    return { year: jalali.year, month: jalali.month };
  });

  // An event created elsewhere (quick-create, day summary) lands the calendar on its day.
  const { calendarFocusDate } = state;
  useEffect(() => {
    if (!calendarFocusDate) return;
    const jalali = gregorianToJalali(fromISODate(calendarFocusDate));
    setCursor({ year: jalali.year, month: jalali.month });
    setFocusedIso(calendarFocusDate);
    dispatch({ type: 'clear-calendar-focus' });
  }, [calendarFocusDate, dispatch]);

  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month, today), [cursor.year, cursor.month, today]);

  // Completed work drops off the calendar: it is a planning surface, not a history.
  const openTasks = useMemo(() => state.tasks.filter((task) => task.status !== 'done'), [state.tasks]);
  const itemsByDate = useMemo(
    () => calendarItemsByDate(openTasks, state.calendarEvents),
    [openTasks, state.calendarEvents],
  );

  const monthIso = cells.find((cell) => cell.inCurrentMonth)?.iso ?? todayIso;
  const monthItemCount = cells
    .filter((cell) => cell.inCurrentMonth)
    .reduce((sum, cell) => sum + (itemsByDate.get(cell.iso)?.length ?? 0), 0);

  const focusDate = (iso: string) => {
    setFocusedIso(iso);
    const jalali = gregorianToJalali(fromISODate(iso));
    if (jalali.year !== cursor.year || jalali.month !== cursor.month) {
      setCursor({ year: jalali.year, month: jalali.month });
    }
  };

  const step = (delta: number) => {
    const next = shiftJalaliMonth(cursor.year, cursor.month, delta);
    setCursor({ year: next.year, month: next.month });
  };

  const createTask = (iso: string) => openTaskComposer(taskDraft({ dueDate: iso }));
  const createEvent = (iso: string) => open({ kind: 'event-composer', date: iso });
  const toggleComplete = (taskId: string, completed: boolean) =>
    dispatch({ type: 'set-task-completed', taskId, completed });

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <header className="border-b border-secondary bg-surface px-4 py-3 sm:px-6">
        <h1 className="text-heading-sm font-bold text-fg-primary">تقویم</h1>
        <span className="numeric text-caption text-fg-tertiary">
          {`${formatCount(monthItemCount)} مهلت، جلسه و نقطه عطف در ${formatJalali(monthIso, 'month-year')}`}
        </span>
      </header>

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[1fr_20rem]">
        <section aria-label="نمای ماهانه" className="flex min-w-0 flex-col gap-3">
          {/*
            One baseline for the whole bar. The two outer groups share the leftover width
            equally (`flex-1`), so the date controls sit exactly over the grid's centre
            whatever the legend or the button measure.
          */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
              <Legend />
            </div>
            <div role="group" aria-label="پیمایش ماه" className="flex items-center gap-1.5">
              <IconButton label="ماه قبل" icon={<ChevronBackwardIcon size={18} />} onClick={() => step(-1)} />
              <span
                className="numeric min-w-24 text-center text-title-sm font-bold text-fg-primary"
                aria-live="polite"
              >
                {formatJalali(monthIso, 'month-year')}
              </span>
              <IconButton label="ماه بعد" icon={<ChevronForwardIcon size={18} />} onClick={() => step(1)} />
              <Button size="sm" variant="secondary" onClick={() => focusDate(todayIso)} className="ms-1">
                امروز
              </Button>
            </div>
            <div className="flex sm:flex-1 sm:justify-end">
              <Button
                size="sm"
                iconStart={<AddIcon size={16} />}
                aria-haspopup="dialog"
                onClick={() => createEvent(focusedIso)}
              >
                رویداد جدید
              </Button>
            </div>
          </div>
          <div className="overflow-visible rounded-xl border border-secondary bg-surface shadow-xs">
            <MonthGrid
              cells={cells}
              itemsByDate={itemsByDate}
              today={today}
              focusedIso={focusedIso}
              onFocusDate={focusDate}
              onCreateTask={createTask}
              onCreateEvent={createEvent}
              onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
              onToggleComplete={toggleComplete}
            />
          </div>
          <p className="text-caption text-fg-tertiary">
            برای ثبت وظیفه‌ای با مهلت مشخص، روی هر روز کلیک کنید.
          </p>
        </section>

        <UpcomingPanel
          itemsByDate={itemsByDate}
          today={today}
          onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
        />
      </div>
    </div>
  );
}

function Legend() {
  const entries = [
    { label: 'مهلت وظیفه', Icon: FlagIcon, tone: 'bg-sunken text-fg-secondary' },
    { label: 'جلسه', Icon: CalendarIcon, tone: 'bg-brand-subtle text-fg-brand' },
    { label: 'یادآور', Icon: NotificationIcon, tone: 'bg-status-progress-subtle text-status-progress' },
    { label: 'نقطه عطف', Icon: MilestoneIcon, tone: 'bg-status-done-subtle text-status-done' },
  ] as const;
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="راهنمای رنگ‌ها">
      {entries.map(({ label, Icon, tone }) => (
        <li key={label} className="flex items-center gap-1.5 text-caption text-fg-tertiary">
          <span className={cn('flex size-5 items-center justify-center rounded-md', tone)} aria-hidden="true">
            <Icon size={12} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

interface UpcomingPanelProps {
  readonly itemsByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  readonly today: Date;
  readonly onOpenTask: (taskId: string) => void;
}

/** Overdue deadlines, then the next two weeks day by day. */
function UpcomingPanel({ itemsByDate, today, onOpenTask }: UpcomingPanelProps) {
  const todayIso = toISODate(today);

  const overdue = useMemo(() => {
    const list: CalendarItem[] = [];
    for (const [date, items] of itemsByDate) {
      if (daysBetween(today, fromISODate(date)) < 0) list.push(...items.filter((item) => item.kind === 'deadline'));
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
            <h3 className="numeric text-caption font-semibold text-fg-secondary">{relativeDay(day.date)}</h3>
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
  const meta = [itemKindLabel(item), itemTimeLabel(item), showDate ? formatJalali(item.date, 'day-month') : null]
    .filter(Boolean)
    .join('، ');
  const content = (
    <>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', itemTone(item, today))}>
        <ItemIcon item={item} size={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm font-semibold text-fg-primary">{itemTitle(item)}</span>
        <span className="numeric truncate text-micro text-fg-tertiary">{meta}</span>
      </span>
    </>
  );

  const className =
    'flex w-full items-center gap-3 rounded-xl border border-secondary bg-surface p-2.5 text-start shadow-xs transition-colors';

  return (
    <li>
      {item.kind === 'deadline' ? (
        <button type="button" onClick={() => onOpenTask(item.task.id)} className={cn(className, 'hover:border-brand')}>
          {content}
        </button>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}
