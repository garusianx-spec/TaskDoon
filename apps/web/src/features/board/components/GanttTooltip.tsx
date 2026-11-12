'use client';

import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
daysBetween,
formatJalali,parseISODate
} from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { statusLabel } from '@/data/reference';
import { BAR_TONE } from '@/features/board/lib/gantt-layout';
import type { HoveredBar } from '@/features/board/hooks/useGanttTimeline';

export function GanttTooltip({ hovered, tooltipId }: { readonly hovered: HoveredBar | null; readonly tooltipId: string }) {
  return hovered &&
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
  );
}
