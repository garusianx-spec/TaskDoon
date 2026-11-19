'use client';

import { useHydrated } from '@/hooks/useHydrated';
import { useNow } from '@/hooks/useNow';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { calendarItemsByDate } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { fromISODate, shiftCalendarMonth, TEHRAN_TIME_ZONE, toISODate } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { MonthGrid } from '@/features/calendar/components/MonthGrid';
import { Button, Skeleton } from '@/components/ui';
import { AddIcon } from '@/components/icons';
import { CalendarDateText } from './CalendarDateText';
import { CalendarMonthNavigation } from './CalendarMonthNavigation';
import { CalendarSystemToggle } from './CalendarSystemToggle';
import { useCalendarGrid } from '../hooks/useCalendarGrid';
import { useCalendarPreference } from '../hooks/useCalendarPreference';
import { Legend } from '@/features/calendar/components/CalendarLegend';
import { UpcomingPanel } from '@/features/calendar/components/UpcomingCalendar';

export function CalendarPage() {
  const hydrated = useHydrated();
  return <AppShell>{hydrated ? <CalendarContent /> : <Skeleton className="m-4 h-96" />}</AppShell>;
}

/**
 * Deadlines, meetings and milestones only — notes live in their own module now. A day holds
 * at most two badges; everything else folds into the day summary, and a click anywhere on a
 * day starts a task due that day.
 */
function CalendarContent() {
  const { state, dispatch, activeWorkspace } = useWorkspace();
  const { open, openTaskComposer } = useOverlays();
  const { system, setCalendarSystem } = useCalendarPreference();
  const timeZone = activeWorkspace.timeZone ?? TEHRAN_TIME_ZONE;
  const todayIso = toISODate(useNow() ?? new Date(), timeZone);
  const today = useMemo(() => fromISODate(todayIso), [todayIso]);
  const [selectedIso, setFocusedIso] = useState<string | null>(null);
  const focusedIso = selectedIso ?? todayIso;
  const grid = useCalendarGrid(system, focusedIso, todayIso);

  // An event created elsewhere lands the calendar on its own civil day.
  const { calendarFocusDate } = state;
  useEffect(() => {
    if (!calendarFocusDate) return;
    setFocusedIso(calendarFocusDate);
    dispatch({ type: 'clear-calendar-focus' });
  }, [calendarFocusDate, dispatch]);

  // Completed work drops off the calendar: it is a planning surface, not a history.
  const openTasks = useMemo(() => state.tasks.filter((task) => task.status !== 'done'), [state.tasks]);
  const itemsByDate = useMemo(
    () => calendarItemsByDate(openTasks, state.calendarEvents),
    [openTasks, state.calendarEvents],
  );

  const monthItemCount = grid.weeks
    .flat()
    .reduce((sum, cell) => sum + (cell.inCurrentMonth ? (itemsByDate.get(cell.iso)?.length ?? 0) : 0), 0);

  const createTask = (iso: string) =>
    openTaskComposer(taskDraft({ dueDate: iso, startDate: iso < todayIso ? iso : todayIso }));
  const createEvent = (iso: string) => open({ kind: 'event-composer', date: iso });
  const toggleComplete = (taskId: string, completed: boolean) =>
    dispatch({ type: 'set-task-completed', taskId, completed });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-secondary bg-surface px-3 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-heading-sm font-bold text-fg-primary">تقویم</h1>
          <CalendarSystemToggle system={system} onChange={setCalendarSystem} />
        </div>
        <p className="truncate text-caption text-fg-tertiary">
          <span className="numeric">{formatCount(monthItemCount)}</span> مهلت، جلسه و نقطه عطف در{' '}
          <CalendarDateText system={system}>{grid.monthLabel}</CalendarDateText>
        </p>
      </header>

      <div className="grid gap-5 p-3 sm:p-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
            <CalendarMonthNavigation
              system={system}
              monthLabel={grid.monthLabel}
              onStep={(delta) => setFocusedIso((iso) => shiftCalendarMonth(system, iso ?? todayIso, delta))}
              onToday={() => setFocusedIso(toISODate(new Date(), timeZone))}
            />
            <div className="flex justify-end sm:flex-1">
              <Button
                size="lg"
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
              grid={grid}
              system={system}
              itemsByDate={itemsByDate}
              today={today}
              focusedIso={focusedIso}
              onFocusDate={setFocusedIso}
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
          system={system}
          itemsByDate={itemsByDate}
          today={today}
          onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
        />
      </div>
    </div>
  );
}
