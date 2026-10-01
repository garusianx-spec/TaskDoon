'use client';

import { useMemo, useState } from 'react';
import type { AgendaEntryKind, Task } from '@/types';
import { AGENDA } from '@/data/workspace';
import { useWorkspace } from '@/store/WorkspaceProvider';
import {
  JALALI_WEEKDAYS,
  JALALI_WEEKDAYS_MEDIUM,
  buildMonthGrid,
  formatJalali,
  gregorianToJalali,
  shiftJalaliMonth,
  toISODate,
} from '@/lib/jalali';
import { formatCount } from '@/lib/format';
import { describeRecurrence } from '@/lib/recurrence';
import { statusLabel, statusTone } from '@/data/reference';
import { cn } from '@/lib/cn';
import { AppShell, useShellActions } from '@/components/layout/AppShell';
import { BLANK_TASK_DRAFT } from '@/components/tasks/CreateTaskModal';
import { MonthYearPicker } from '@/components/calendar/MonthYearPicker';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import { bucketAt, buildDayIndex } from '@/components/calendar/day-index';
import { Badge, Button, EmptyState, IconButton, Tooltip } from '@/components/ui';
import {
  AddIcon,
  CalendarIcon,
  ChevronBackwardIcon,
  ChevronForwardIcon,
  ClockIcon,
  DocumentIcon,
  NotificationIcon,
  RefreshIcon,
  TaskSquareIcon,
} from '@/components/icons';

const KIND_ICONS: Readonly<Record<AgendaEntryKind, typeof CalendarIcon>> = {
  task: TaskSquareIcon,
  meeting: CalendarIcon,
  note: DocumentIcon,
  reminder: NotificationIcon,
};

const KIND_LABELS: Readonly<Record<AgendaEntryKind, string>> = {
  task: 'وظیفه',
  meeting: 'جلسه',
  note: 'یادداشت',
  reminder: 'یادآور',
};

export default function CalendarPage() {
  return (
    <AppShell>
      <CalendarWorkspace />
    </AppShell>
  );
}

function CalendarWorkspace() {
  const { state, dispatch } = useWorkspace();
  const { openTaskComposer } = useShellActions();

  const today = useMemo(() => new Date(), []);
  const [selectedIso, setSelectedIso] = useState(() => toISODate(today));
  const [cursor, setCursor] = useState(() => {
    const jalali = gregorianToJalali(today);
    return { year: jalali.year, month: jalali.month };
  });

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, today),
    [cursor.year, cursor.month, today],
  );

  // The grid always spans six weeks, so the index window is the grid's own bounds.
  const dayIndex = useMemo(() => {
    const first = cells[0]?.iso ?? selectedIso;
    const last = cells[cells.length - 1]?.iso ?? selectedIso;
    return buildDayIndex(state.tasks, AGENDA, first, last);
  }, [cells, state.tasks, selectedIso]);

  const selectedBucket = bucketAt(dayIndex, selectedIso);
  const selectedTasks = [...selectedBucket.pending, ...selectedBucket.recurring, ...selectedBucket.completed];
  const isToday = selectedIso === toISODate(today);

  const step = (delta: number) => {
    const next = shiftJalaliMonth(cursor.year, cursor.month, delta);
    setCursor({ year: next.year, month: next.month });
  };

  const goToToday = () => {
    const jalali = gregorianToJalali(today);
    setCursor({ year: jalali.year, month: jalali.month });
    setSelectedIso(toISODate(today));
  };

  /** Quick-create from a day cell: the composer opens with that Jalali date pre-populated. */
  const quickCreate = (iso: string) => {
    setSelectedIso(iso);
    openTaskComposer({ ...BLANK_TASK_DRAFT, dueDate: iso });
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-secondary bg-surface px-4 py-3 sm:px-6">
        <h1 className="text-heading-sm font-bold text-fg-primary">تقویم و یادداشت</h1>
        <Badge tone="neutral" size="md" numeric className="ms-auto">
          {`${formatCount(AGENDA.length)} برنامه ثبت‌شده`}
        </Badge>
      </header>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_22rem]">
        <section
          aria-label="نمای ماهانه"
          className="rounded-xl border border-secondary bg-surface p-3 shadow-xs"
        >
          {/*
            Navigation sits directly above the grid and is centred on it, not on the page
            header — which spans the agenda column too and would pull the month off-centre.
            RTL puts the first child on the right, so "قبل" leads and "بعد" trails, matching
            the direction each chevron points.
          */}
          <div className="relative mb-3 flex items-center justify-center gap-2 pb-3">
            <Tooltip content="ماه قبل">
              <IconButton
                label="ماه قبل"
                icon={<ChevronBackwardIcon size={18} />}
                variant="secondary"
                onClick={() => step(-1)}
              />
            </Tooltip>

            <MonthYearPicker
              year={cursor.year}
              month={cursor.month}
              onChange={(year, month) => setCursor({ year, month })}
            />

            <Tooltip content="ماه بعد">
              <IconButton
                label="ماه بعد"
                icon={<ChevronForwardIcon size={18} />}
                variant="secondary"
                onClick={() => step(1)}
              />
            </Tooltip>

            {/* Absolutely placed so it cannot shift the centred month/year group. */}
            <Button
              variant={isToday ? 'tertiary' : 'secondary'}
              size="sm"
              iconStart={<CalendarIcon size={16} />}
              onClick={goToToday}
              className="absolute end-0 top-0"
            >
              امروز
            </Button>
          </div>

          <div role="grid" aria-label="تقویم هجری شمسی" className="grid grid-cols-7 gap-1">
            {JALALI_WEEKDAYS.map((day, index) => (
              <div
                key={day}
                role="columnheader"
                className="flex h-8 items-center justify-center text-caption font-semibold text-fg-quaternary"
              >
                {/* Full names need the room; below `sm` the two-letter form keeps cells square. */}
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{JALALI_WEEKDAYS_MEDIUM[index]}</span>
              </div>
            ))}

            {cells.map((cell) => (
              <CalendarDayCell
                key={cell.iso}
                cell={cell}
                bucket={bucketAt(dayIndex, cell.iso)}
                selected={cell.iso === selectedIso}
                onSelect={setSelectedIso}
                onQuickCreate={quickCreate}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-secondary pt-3">
            <Legend tone="progress" label="وظایف باز" />
            <Legend tone="done" label="انجام‌شده" />
            <Legend tone="review" label="رویدادها" />
            <span className="ms-auto text-micro text-fg-quaternary">
              برای ثبت سریع، روی روز دوبار کلیک کنید
            </span>
          </div>
        </section>

        <section aria-label="برنامه روز انتخاب‌شده" className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-title font-bold text-fg-primary">{formatJalali(selectedIso, 'long')}</h2>
            <Badge tone="neutral" size="sm" numeric className="ms-auto">
              {`${formatCount(selectedTasks.length + selectedBucket.entries.length)} مورد`}
            </Badge>
          </div>

          <Button
            variant="secondary"
            fullWidth
            iconStart={<AddIcon size={16} />}
            onClick={() => quickCreate(selectedIso)}
          >
            ثبت وظیفه / رویداد برای این روز
          </Button>

          {selectedTasks.length === 0 && selectedBucket.entries.length === 0 ? (
            <EmptyState
              compact
              icon={<CalendarIcon size={20} />}
              title="برنامه‌ای برای این روز ثبت نشده"
              description="روز دیگری را انتخاب کنید یا با دکمه بالا مورد جدیدی بسازید."
            />
          ) : (
            <>
              {selectedTasks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
                    وظایف
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {selectedTasks.map((task) => (
                      <li key={`${task.id}-${selectedIso}`}>
                        <TaskRow
                          task={task}
                          recurringOccurrence={selectedBucket.recurring.includes(task)}
                          onOpen={() => dispatch({ type: 'open-task', taskId: task.id })}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedBucket.entries.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
                    رویدادها و یادداشت‌ها
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {selectedBucket.entries.map((entry) => {
                      const Icon = KIND_ICONS[entry.kind];
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (entry.relatedTaskId) {
                                dispatch({ type: 'open-task', taskId: entry.relatedTaskId });
                              }
                            }}
                            disabled={entry.relatedTaskId === null}
                            className={cn(
                              'flex w-full items-start gap-3 rounded-xl border border-secondary bg-surface p-3 text-start shadow-xs transition-colors',
                              entry.relatedTaskId ? 'hover:border-brand' : 'cursor-default',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                                entry.tone === 'blocked' && 'bg-status-blocked-subtle text-status-blocked',
                                entry.tone === 'progress' && 'bg-status-progress-subtle text-status-progress',
                                entry.tone === 'done' && 'bg-status-done-subtle text-status-done',
                                entry.tone === 'review' && 'bg-status-review-subtle text-status-review',
                                entry.tone === 'todo' && 'bg-status-todo-subtle text-status-todo',
                              )}
                            >
                              <Icon size={18} variant="twotone" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="truncate text-body-sm font-semibold text-fg-primary">
                                {entry.title}
                              </span>
                              <span className="flex items-center gap-2">
                                <Badge tone="neutral" size="sm">
                                  {KIND_LABELS[entry.kind]}
                                </Badge>
                                {entry.startTime && (
                                  <span className="numeric inline-flex items-center gap-1 text-micro text-fg-tertiary">
                                    <ClockIcon size={12} />
                                    {entry.endTime
                                      ? `${entry.startTime} تا ${entry.endTime}`
                                      : entry.startTime}
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Legend({ tone, label }: { readonly tone: 'progress' | 'done' | 'review'; readonly label: string }) {
  const tones = {
    progress: 'bg-status-progress',
    done: 'bg-status-done',
    review: 'bg-status-review',
  } as const;
  return (
    <span className="inline-flex items-center gap-1.5 text-micro text-fg-tertiary">
      <span className={cn('size-2 rounded-full', tones[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}

interface TaskRowProps {
  readonly task: Task;
  readonly recurringOccurrence: boolean;
  readonly onOpen: () => void;
}

function TaskRow({ task, recurringOccurrence, onOpen }: TaskRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl border border-secondary bg-surface p-3 text-start shadow-xs transition-colors hover:border-brand"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          task.status === 'done'
            ? 'bg-status-done-subtle text-status-done'
            : 'bg-status-progress-subtle text-status-progress',
        )}
      >
        {recurringOccurrence ? <RefreshIcon size={18} /> : <TaskSquareIcon size={18} variant="twotone" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'truncate text-body-sm font-semibold',
            task.status === 'done' ? 'text-fg-tertiary line-through' : 'text-fg-primary',
          )}
        >
          {task.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(task.status)} size="sm" dot>
            {statusLabel(task.status)}
          </Badge>
          <span className="numeric text-micro text-fg-quaternary latin-inline">{task.code}</span>
          {recurringOccurrence && task.recurrence && (
            <Badge tone="review" size="sm" iconStart={<RefreshIcon size={11} />}>
              {describeRecurrence(task.recurrence)}
            </Badge>
          )}
          {task.reminder && (
            <span className="inline-flex items-center text-status-progress" title="یادآوری فعال">
              <NotificationIcon size={13} />
              <span className="sr-only">یادآوری فعال</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
