'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Task } from '@/types';
import { cn } from '@/lib/cn';
import {
  JALALI_WEEKDAYS_SHORT,
  addDays,
  daysBetween,
  formatJalali,
  gregorianToJalali,
  jalaliWeekdayIndex,
  parseISODate,
  toISODate,
  toPersianDigits,
} from '@/lib/jalali';
import { formatCount } from '@/lib/format';
import { statusLabel, statusTone } from '@/data/reference';
import { projectById, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, Button, EmptyState } from '@/components/ui';
import { ChevronBackwardIcon, ChevronForwardIcon, GanttIcon } from '@/components/icons';

export interface GanttViewProps {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly onOpenTask: (taskId: string) => void;
  readonly selectedTaskId: string | null;
}

const BAR_TONE: Readonly<Record<Task['status'], string>> = {
  todo: 'bg-status-todo',
  'in-progress': 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
};

/** Days rendered either side of the anchor. Wide enough to pan across a quarter. */
const WINDOW_DAYS = 120;
/** Fixed px per day — the timeline scrolls rather than compressing to fit. */
const DAY_WIDTH = 44;
/** Width of the sticky task column. */
const NAME_WIDTH = 224;

/**
 * Jalali Gantt.
 *
 * The timeline is a CSS grid of one column per day. Because the container inherits
 * `dir="rtl"`, column 1 is the right-most cell and bars naturally run right-to-left — no
 * coordinate mirroring is needed, only `gridColumnStart` / `gridColumnEnd`.
 *
 * Thursday and Friday (Jalali weekday indices 5 and 6) are shaded as the Iranian weekend.
 */
export function GanttView({ tasks, projects, onOpenTask, selectedTaskId }: GanttViewProps) {
  // A fixed span the user pans within, rather than a window that re-anchors on every step.
  const [windowStart] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 30);
    return toISODate(today);
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<{ startX: number; startScroll: number } | null>(null);
  const [panning, setPanning] = useState(false);

  /** Brings a date to the centre of the viewport. */
  const scrollToDate = useCallback(
    (iso: string, behavior: ScrollBehavior = 'smooth') => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const offset = daysBetween(parseISODate(windowStart), parseISODate(iso));
      const timelineWidth = scroller.clientWidth - NAME_WIDTH;
      // RTL scrollers use negative scrollLeft in Chromium/Firefox, positive-from-right in
      // some engines; `scrollTo` with a negative value is the portable form here.
      scroller.scrollTo({
        left: -(offset * DAY_WIDTH - timelineWidth / 2),
        behavior,
      });
    },
    [windowStart],
  );

  // Open centred on today rather than at the start of the window.
  useEffect(() => {
    scrollToDate(toISODate(new Date()), 'auto');
    // Only on mount: later scrolling is user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Shift + wheel pans horizontally, matching the convention in spreadsheet timelines.
   *
   * Registered manually rather than through React's `onWheel`, because React attaches wheel
   * handlers passively — `preventDefault` would be refused there and the page would scroll
   * vertically at the same time as the timeline panned.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  /** Pans by whole days without re-anchoring the window. */
  const nudge = useCallback((days: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: -days * DAY_WIDTH, behavior: 'smooth' });
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Drag-to-pan only from empty timeline space; bars and buttons keep their own behaviour.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, a, [role="button"]')) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    panState.current = { startX: event.clientX, startScroll: scroller.scrollLeft };
    setPanning(true);
    scroller.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = panState.current;
    const scroller = scrollerRef.current;
    if (!state || !scroller) return;
    scroller.scrollLeft = state.startScroll - (event.clientX - state.startX);
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current) return;
    panState.current = null;
    setPanning(false);
    scrollerRef.current?.releasePointerCapture(event.pointerId);
  };

  const days = useMemo(
    () =>
      Array.from({ length: WINDOW_DAYS }, (_, index) => {
        const iso = addDays(windowStart, index);
        const date = parseISODate(iso);
        const jalali = gregorianToJalali(date);
        const weekdayIndex = jalaliWeekdayIndex(date);
        return {
          iso,
          jalali,
          weekdayIndex,
          isWeekend: weekdayIndex === 5 || weekdayIndex === 6,
          isToday: daysBetween(date, new Date()) === 0,
        };
      }),
    [windowStart],
  );

  const rows = useMemo(
    () =>
      tasks
        .map((task) => {
          const startOffset = daysBetween(parseISODate(windowStart), parseISODate(task.startDate));
          const endOffset = daysBetween(parseISODate(windowStart), parseISODate(task.dueDate));
          // Clip to the visible window; skip tasks entirely outside it.
          const from = Math.max(0, startOffset);
          const to = Math.min(WINDOW_DAYS - 1, endOffset);
          if (endOffset < 0 || startOffset > WINDOW_DAYS - 1) return null;
          return {
            task,
            column: from + 1,
            span: Math.max(1, to - from + 1),
            clippedStart: startOffset < 0,
            clippedEnd: endOffset > WINDOW_DAYS - 1,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    [tasks, windowStart],
  );

  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const timelineWidth = WINDOW_DAYS * DAY_WIDTH;

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<GanttIcon size={26} />}
        title="وظیفه‌ای برای نمایش در گانت نیست"
        description="فیلترها را تغییر دهید تا بازه زمانی وظایف نمایش داده شود."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-secondary px-4 py-3">
        <h3 className="text-title-sm font-semibold text-fg-primary">نمای گانت شمسی</h3>
        {firstDay && lastDay && (
          <span className="numeric text-caption text-fg-tertiary">
            {`${formatJalali(firstDay.iso, 'medium')} تا ${formatJalali(lastDay.iso, 'medium')}`}
          </span>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            iconStart={<ChevronBackwardIcon size={16} />}
            onClick={() => nudge(-7)}
          >
            هفته قبل
          </Button>
          <Button size="xs" variant="secondary" onClick={() => scrollToDate(toISODate(new Date()))}>
            امروز
          </Button>
          <Button
            size="xs"
            variant="secondary"
            iconEnd={<ChevronForwardIcon size={16} />}
            onClick={() => nudge(7)}
          >
            هفته بعد
          </Button>
        </div>
      </div>

      {/*
        Fixed day width + horizontal scroll, instead of compressing a whole window into the
        available width. The task column is sticky on the inline-start edge of the scroller
        (the right-hand side in RTL) so it stays put while the timeline slides underneath.
      */}
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        className={cn(
          'scrollbar-thin relative flex-1 overflow-auto overscroll-x-contain scroll-smooth',
          panning ? 'cursor-grabbing select-none' : 'cursor-grab',
        )}
      >
        <div style={{ width: NAME_WIDTH + timelineWidth }}>
          {/* Header row: weekday name + Jalali day number */}
          <div className="sticky top-0 z-sticky flex border-b border-secondary bg-surface">
            <div
              className="sticky start-0 z-10 flex shrink-0 items-center border-e border-secondary bg-surface px-3 py-2 text-title-sm font-semibold text-fg-secondary"
              style={{ width: NAME_WIDTH }}
            >
              وظیفه
            </div>
            <div className="flex">
              {days.map((day) => (
                <div
                  key={day.iso}
                  className={cn(
                    'flex shrink-0 flex-col items-center justify-center border-e border-tertiary/60 py-1.5 text-micro',
                    day.isWeekend && 'bg-sunken',
                    day.isToday && 'bg-brand-subtle',
                  )}
                  style={{ width: DAY_WIDTH }}
                >
                  <span className="text-fg-quaternary">{JALALI_WEEKDAYS_SHORT[day.weekdayIndex]}</span>
                  <span
                    className={cn(
                      'numeric font-semibold',
                      day.isToday ? 'text-fg-brand' : 'text-fg-secondary',
                    )}
                  >
                    {toPersianDigits(day.jalali.day)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Task rows */}
          <ul>
            {rows.map(({ task, column, span, clippedStart, clippedEnd }) => {
              const assignees = usersByIds(task.assigneeIds);
              const project = projectById(projects, task.projectId);

              return (
                <li
                  key={task.id}
                  className={cn(
                    'flex border-b border-tertiary transition-colors hover:bg-hover',
                    selectedTaskId === task.id && 'bg-brand-subtle',
                  )}
                >
                  <div
                    className="sticky start-0 z-10 flex shrink-0 items-center gap-2 border-e border-secondary bg-surface px-3 py-2"
                    style={{ width: NAME_WIDTH }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-caption font-semibold text-fg-primary">
                        {task.title}
                      </span>
                      <span className="numeric truncate text-micro text-fg-tertiary">
                        {`${task.code}، ${project?.name ?? ''}`}
                      </span>
                    </span>
                    {assignees.length > 0 && <AvatarStack members={assignees} max={2} size="xs" />}
                  </div>

                  <div className="relative flex" style={{ width: timelineWidth }}>
                    {days.map((day) => (
                      <div
                        key={`${task.id}-${day.iso}`}
                        aria-hidden="true"
                        className={cn(
                          'h-11 shrink-0 border-e border-tertiary/60',
                          day.isWeekend && 'bg-sunken/70',
                          day.isToday && 'bg-brand-subtle/60',
                        )}
                        style={{ width: DAY_WIDTH }}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      aria-label={`${task.title} — از ${formatJalali(task.startDate, 'medium')} تا ${formatJalali(task.dueDate, 'medium')}`}
                      style={{
                        // RTL: day zero is the right-hand edge, so bars are offset from `right`.
                        insetInlineStart: (column - 1) * DAY_WIDTH + 2,
                        width: span * DAY_WIDTH - 4,
                      }}
                      className={cn(
                        'absolute top-1/2 z-10 flex h-6 -translate-y-1/2 items-center gap-1.5 px-2 text-micro font-semibold text-white transition-transform hover:scale-[1.02]',
                        BAR_TONE[task.status],
                        // A clipped edge stays square so it reads as "continues beyond the window".
                        !clippedStart && 'rounded-s-full',
                        !clippedEnd && 'rounded-e-full',
                      )}
                    >
                      <span className="truncate">{task.title}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {rows.length === 0 && (
            <EmptyState
              compact
              icon={<GanttIcon size={20} />}
              title="در این بازه وظیفه‌ای نیست"
              description="با کشیدن تایم‌لاین یا دکمه‌های هفته قبل و بعد بازه را جابه‌جا کنید."
            />
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-secondary px-4 py-2.5">
        <span className="numeric text-caption text-fg-tertiary">
          {`${formatCount(rows.length)} وظیفه در بازه نمایش`}
        </span>
        <span className="text-micro text-fg-quaternary">
          برای جابه‌جایی، تایم‌لاین را بکشید یا Shift + چرخ ماوس را بزنید
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(['todo', 'in-progress', 'review', 'done'] as const).map((status) => (
            <Badge key={status} tone={statusTone(status)} size="sm" dot>
              {statusLabel(status)}
            </Badge>
          ))}
        </div>
      </footer>
    </div>
  );
}
