'use client';

import { jalaliFromIsoDate } from '@/lib/jalali';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { calendarItemsByDate } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { buildMonthGrid, formatJalali, shiftJalaliMonth, toISODate } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { SectionBackLink } from '@/components/layout/NavigationList';
import { workspaceRoutes } from '@/lib/workspace-navigation';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { MonthGrid } from '@/features/calendar/components/MonthGrid';
import { Button, IconButton } from '@/components/ui';
import { AddIcon, ChevronBackwardIcon, ChevronForwardIcon } from '@/components/icons';
import { Legend } from '@/features/calendar/components/CalendarLegend';
import { UpcomingPanel } from '@/features/calendar/components/UpcomingCalendar';

export function CalendarPage() {
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
    const jalali = jalaliFromIsoDate(todayIso);
    return { year: jalali.year, month: jalali.month };
  });

  // An event created elsewhere (quick-create, day summary) lands the calendar on its day.
  const { calendarFocusDate } = state;
  useEffect(() => {
    if (!calendarFocusDate) return;
    const jalali = jalaliFromIsoDate(calendarFocusDate);
    setCursor({ year: jalali.year, month: jalali.month });
    setFocusedIso(calendarFocusDate);
    dispatch({ type: 'clear-calendar-focus' });
  }, [calendarFocusDate, dispatch]);

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, today),
    [cursor.year, cursor.month, today],
  );

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
    const jalali = jalaliFromIsoDate(iso);
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
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-secondary bg-surface px-4 py-3 sm:px-6">
        <div className="lg:hidden">
          <SectionBackLink href={workspaceRoutes.more}>بیشتر</SectionBackLink>
        </div>
        <h1 className="text-heading-sm font-bold text-fg-primary">تقویم</h1>
        <span className="text-caption text-fg-tertiary numeric">
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
              <IconButton
                className="max-sm:size-11"
                label="ماه قبل"
                icon={<ChevronBackwardIcon size={18} />}
                onClick={() => step(-1)}
              />
              <span
                className="min-w-24 text-center text-title-sm font-bold text-fg-primary numeric"
                aria-live="polite"
              >
                {formatJalali(monthIso, 'month-year')}
              </span>
              <IconButton
                className="max-sm:size-11"
                label="ماه بعد"
                icon={<ChevronForwardIcon size={18} />}
                onClick={() => step(1)}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => focusDate(todayIso)}
                className="ms-1 max-sm:min-h-11"
              >
                امروز
              </Button>
            </div>
            <div className="flex sm:flex-1 sm:justify-end">
              <Button
                size="sm"
                className="max-sm:min-h-11"
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
