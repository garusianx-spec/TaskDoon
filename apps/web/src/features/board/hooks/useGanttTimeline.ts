'use client';

import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { Task } from '@taskin/contracts';
import {
addDays,
daysBetween,gregorianToJalali,
jalaliWeekdayIndex,
parseISODate,
toISODate
} from '@taskin/jalali';
import { useNamespacedId } from '@/hooks/useId';
import { WINDOW_DAYS } from '@/features/board/lib/gantt-layout';

/** The window opens this many days before today, so the recent past is a short scroll back. */
const LEAD_DAYS = 28;
/** How far the window moves when a week step runs past its end. */
const SHIFT_DAYS = 28;
/** Days left in view before today when the timeline jumps to it. */
const TODAY_INSET = 3;
/** Every day has one fixed width, so the timeline is wider than the view and scrolls. */

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

export interface HoveredBar {
  readonly task: Task;
  /** Viewport point the tooltip hangs from (fixed positioning, so it is never clipped). */
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

export function useGanttTimeline(tasks: readonly Task[]) {
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

  return { scrollerRef, onScroll, hovered, setHovered, tooltipId, scrollDays, scrollToToday, showTooltip, days, rows, firstDay, lastDay };
}
