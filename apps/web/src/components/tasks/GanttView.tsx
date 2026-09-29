'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '@taskin/contracts';
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
} from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { statusLabel, statusTone } from '@/data/reference';
import { projectById, usersByIds } from '@/store/selectors';
import { useNamespacedId } from '@/hooks/useId';
import { AvatarStack, Badge, Button, EmptyState } from '@/components/ui';
import { ChevronBackwardIcon, ChevronForwardIcon, GanttIcon } from '@/components/icons';

export interface GanttViewProps {
  readonly tasks: readonly Task[];
  readonly onOpenTask: (taskId: string) => void;
  readonly selectedTaskId: string | null;
}

const BAR_TONE: Readonly<Record<Task['status'], string>> = {
  todo: 'bg-status-todo',
  'in-progress': 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
};

/** Days loaded at once: the timeline scrolls through them and loads more at either end. */
const WINDOW_DAYS = 12 * 7;
/** The window opens this many days before today, so the recent past is a short scroll back. */
const LEAD_DAYS = 28;
/** How far the window moves when a week step runs past its end. */
const SHIFT_DAYS = 28;
/** Days left in view before today when the timeline jumps to it. */
const TODAY_INSET = 3;
/** Every day has one fixed width, so the timeline is wider than the view and scrolls. */
const GRID_TEMPLATE = `14rem repeat(${WINDOW_DAYS}, 2.5rem)`;

const todayWindowStart = () => addDays(toISODate(new Date()), -LEAD_DAYS);

/** A scroll to finish once the window's new days are laid out. */
type PendingScroll =
  | { readonly kind: 'shift'; readonly shiftDays: number; readonly thenDays: number }
  | { readonly kind: 'today' };

/**
 * The scroller's geometry in "px from the window's first day", the same number whether the
 * page is RTL (where later days sit at a negative `scrollLeft`) or LTR.
 */
function timeline(scroller: HTMLElement) {
  const sign = getComputedStyle(scroller).direction === 'rtl' ? -1 : 1;
  const day = scroller.querySelector<HTMLElement>('[data-day-index]')?.getBoundingClientRect().width || 40;
  const names = scroller.querySelector<HTMLElement>('[data-gantt-corner]')?.getBoundingClientRect().width ?? 0;
  return {
    day,
    max: scroller.scrollWidth - scroller.clientWidth,
    offset: sign * scroller.scrollLeft,
    visibleDays: Math.max(1, Math.floor((scroller.clientWidth - names) / day)),
    scrollTo: (offset: number, behavior: ScrollBehavior = 'instant') => scroller.scrollTo({ left: sign * offset, behavior }),
  };
}

interface HoveredBar {
  readonly task: Task;
  /** Viewport point the tooltip hangs from (fixed positioning, so it is never clipped). */
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

/**
 * Jalali Gantt.
 *
 * The timeline is a CSS grid of one fixed-width column per day, twelve weeks at a time,
 * scrolled sideways: natively, or a week at a time (smoothly) with the header buttons, which
 * load four more weeks when they run past either end. Because the container inherits
 * `dir="rtl"`, column 1 is the right-most cell and bars naturally run right-to-left — no
 * coordinate mirroring is needed, only `gridColumnStart` / `gridColumnEnd`.
 *
 * Thursday and Friday (Jalali weekday indices 5 and 6) are shaded as the Iranian weekend.
 * Hovering or focusing a bar shows its title, status and dates.
 *
 * Layering, bottom to top, so bars glide *under* the titles when the timeline scrolls:
 *   z-0   day grid lines and weekend/today shading
 *   z-10  task duration bars
 *   z-20  the task name/code column — `sticky start-0` (the right edge in RTL), opaque
 *   z-30  the calendar header — `sticky top-0`, above everything as rows scroll under it
 */
export function GanttView({ tasks, onOpenTask, selectedTaskId }: GanttViewProps) {
  const [windowStart, setWindowStart] = useState(todayWindowStart);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);
  const measureFrame = useRef(0);
  // The days actually in view, for the header's date range.
  const [inView, setInView] = useState({ first: 0, count: WINDOW_DAYS });
  const [hovered, setHovered] = useState<HoveredBar | null>(null);
  const tooltipId = useNamespacedId('gantt-tip-');
  const empty = tasks.length === 0;

  const measure = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const { day, offset, visibleDays } = timeline(scroller);
    const first = Math.min(WINDOW_DAYS - 1, Math.max(0, Math.round(offset / day)));
    setInView((current) => (current.first === first && current.count === visibleDays ? current : { first, count: visibleDays }));
  }, []);

  const onScroll = () => {
    // A tooltip hangs from where its bar was; once the bars move it would point at nothing.
    setHovered(null);
    if (measureFrame.current) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = 0;
      measure();
    });
  };

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(measureFrame.current);
    };
  }, [measure]);

  // Open on today (a few days of the past in view), without animating the first paint.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const view = timeline(scroller);
    view.scrollTo((LEAD_DAYS - TODAY_INSET) * view.day);
    measure();
  }, [empty, measure]);

  // After the window moves, keep the same days in view, then finish the step smoothly.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const move = pendingScroll.current;
    if (!scroller || !move) return;
    pendingScroll.current = null;
    const view = timeline(scroller);
    if (move.kind === 'today') {
      view.scrollTo((LEAD_DAYS - TODAY_INSET) * view.day, 'smooth');
      return;
    }
    const kept = view.offset - move.shiftDays * view.day;
    view.scrollTo(kept);
    view.scrollTo(kept + move.thenDays * view.day, 'smooth');
  }, [windowStart]);

  /** Scrolls the timeline by whole days (positive = later), loading more past either end. */
  const scrollDays = (delta: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const view = timeline(scroller);
    const target = view.offset + delta * view.day;
    if (target < 0 || target > view.max) {
      pendingScroll.current = { kind: 'shift', shiftDays: Math.sign(delta) * SHIFT_DAYS, thenDays: delta };
      setWindowStart((current) => addDays(current, Math.sign(delta) * SHIFT_DAYS));
      return;
    }
    view.scrollTo(target, 'smooth');
  };

  const scrollToToday = () => {
    const start = todayWindowStart();
    if (start !== windowStart) {
      pendingScroll.current = { kind: 'today' };
      setWindowStart(start);
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const view = timeline(scroller);
    view.scrollTo((LEAD_DAYS - TODAY_INSET) * view.day, 'smooth');
  };

  /** Hangs the tooltip over the part of the bar that is in view (it may run under the task column). */
  const showTooltip = (task: Task, bar: HTMLElement) => {
    const rect = bar.getBoundingClientRect();
    const scroller = scrollerRef.current?.getBoundingClientRect();
    const names = scrollerRef.current?.querySelector('[data-gantt-corner]')?.getBoundingClientRect();
    let from = rect.left;
    let to = rect.right;
    if (scroller && names) {
      // The pinned task column sits at the inline start: the right edge in RTL, the left in LTR.
      const namesOnRight = names.left > scroller.left + 1;
      from = Math.max(from, namesOnRight ? scroller.left : names.right);
      to = Math.min(to, namesOnRight ? names.left : scroller.right);
    }
    const centre = to > from ? (from + to) / 2 : rect.left + rect.width / 2;
    const below = rect.top < 96;
    setHovered({
      task,
      x: Math.min(window.innerWidth - 152, Math.max(152, centre)),
      y: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
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

  const firstDay = days[inView.first];
  const lastDay = days[Math.min(WINDOW_DAYS - 1, inView.first + inView.count - 1)];

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
            onClick={() => scrollDays(-7)}
          >
            هفته قبل
          </Button>
          <Button size="xs" variant="secondary" onClick={scrollToToday}>
            امروز
          </Button>
          <Button
            size="xs"
            variant="secondary"
            iconEnd={<ChevronForwardIcon size={16} />}
            onClick={() => scrollDays(7)}
          >
            هفته بعد
          </Button>
        </div>
      </div>

      <div ref={scrollerRef} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-auto overscroll-x-contain">
        <div className="w-max min-w-full">
          {/* Header row: day numbers + weekday initials */}
          <div
            className="sticky top-0 z-30 grid border-b border-secondary bg-surface"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            {/* Corner cell: pinned on both axes, opaque over the day cells it covers. */}
            <div
              data-gantt-corner
              className="sticky start-0 z-10 border-e border-secondary bg-surface px-3 py-2 text-title-sm font-semibold text-fg-secondary"
            >
              وظیفه
            </div>
            {days.map((day, dayIndex) => (
              <div
                key={day.iso}
                data-day-index={dayIndex}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 text-micro',
                  day.isWeekend && 'bg-sunken',
                  day.isToday && 'bg-brand-subtle',
                )}
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

          {/* Task rows */}
          <ul>
            {rows.map(({ task, column, span, clippedStart, clippedEnd }) => {
              const assignees = usersByIds(task.assigneeIds);
              const project = projectById(task.projectId);
              const selected = selectedTaskId === task.id;

              return (
                <li
                  key={task.id}
                  className={cn(
                    'group/row grid items-center border-b border-tertiary transition-colors hover:bg-hover',
                    selected && 'bg-brand-subtle',
                  )}
                  style={{ gridTemplateColumns: GRID_TEMPLATE }}
                >
                  {/*
                    Opaque (never transparent) so a bar scrolled beneath it is fully hidden; it
                    repaints the row's hover/selected tint itself for the same reason.
                  */}
                  <div
                    className={cn(
                      'sticky start-0 z-20 flex h-full min-w-0 items-center gap-2 border-e border-secondary px-3 py-2 transition-colors',
                      selected ? 'bg-brand-subtle' : 'bg-surface group-hover/row:bg-hover',
                    )}
                    style={{ gridRow: 1, gridColumn: 1 }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-caption font-semibold text-fg-primary">{task.title}</span>
                      <span className="numeric truncate text-micro text-fg-tertiary">
                        {`${task.code}، ${project?.name ?? ''}`}
                      </span>
                    </span>
                    {assignees.length > 0 && <AvatarStack members={assignees} max={2} size="xs" />}
                  </div>

                  {/* Weekend/today shading sits under the bar as its own grid children. */}
                  {days.map((day, dayIndex) => (
                    <div
                      key={`${task.id}-${day.iso}`}
                      aria-hidden="true"
                      className={cn(
                        'relative z-0 h-10 border-e border-tertiary/60',
                        day.isWeekend && 'bg-sunken/70',
                        day.isToday && 'bg-brand-subtle/60',
                      )}
                      style={{ gridRow: 1, gridColumn: dayIndex + 2 }}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    onMouseEnter={(event) => showTooltip(task, event.currentTarget)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={(event) => showTooltip(task, event.currentTarget)}
                    onBlur={() => setHovered(null)}
                    aria-describedby={hovered?.task.id === task.id ? tooltipId : undefined}
                    aria-label={`${task.title} — از ${formatJalali(task.startDate, 'medium')} تا ${formatJalali(task.dueDate, 'medium')}`}
                    style={{ gridRow: 1, gridColumnStart: column + 1, gridColumnEnd: `span ${span}` }}
                    className={cn(
                      // Dark mode lifts status fills to light tints, so the label flips to ink
                      // to keep AA contrast on every bar.
                      'relative z-10 mx-0.5 flex h-6 items-center gap-1.5 px-2 text-micro font-semibold text-white transition-transform hover:scale-[1.02] dark:text-gray-950',
                      BAR_TONE[task.status],
                      // A clipped edge stays square so it reads as "continues beyond the window".
                      !clippedStart && 'rounded-s-full',
                      !clippedEnd && 'rounded-e-full',
                    )}
                  >
                    <span className="truncate">{task.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {rows.length === 0 && (
            <EmptyState
              compact
              icon={<GanttIcon size={20} />}
              title="در این بازه وظیفه‌ای نیست"
              description="با دکمه‌های هفته قبل و بعد بازه را جابه‌جا کنید."
            />
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-secondary px-4 py-2.5">
        <span className="numeric text-caption text-fg-tertiary">
          {`${formatCount(rows.length)} وظیفه در بازه نمایش`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {(['todo', 'in-progress', 'review', 'done'] as const).map((status) => (
            <Badge key={status} tone={statusTone(status)} size="sm" dot>
              {statusLabel(status)}
            </Badge>
          ))}
        </div>
      </footer>

      {hovered &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{ left: hovered.x, top: hovered.y }}
            className={cn(
              'pointer-events-none fixed z-popover flex w-max max-w-72 -translate-x-1/2 animate-fade-in flex-col gap-1 rounded-lg bg-gray-900 px-3 py-2 text-white shadow-lg',
              !hovered.below && '-translate-y-full',
            )}
          >
            <span className="text-caption font-semibold leading-5">{hovered.task.title}</span>
            <span className="flex items-center gap-1.5 text-micro text-white/80">
              <span className={cn('size-2 shrink-0 rounded-full', BAR_TONE[hovered.task.status])} aria-hidden="true" />
              {statusLabel(hovered.task.status)}
              <span className="numeric latin-inline text-white/60">{hovered.task.code}</span>
            </span>
            <span className="numeric text-micro text-white/80">
              {`${formatJalali(hovered.task.startDate, 'medium')} تا ${formatJalali(hovered.task.dueDate, 'medium')}، ${formatCount(
                daysBetween(parseISODate(hovered.task.startDate), parseISODate(hovered.task.dueDate)) + 1,
              )} روز`}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
