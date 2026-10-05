'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Task } from '@/types';
import { cn } from '@/lib/cn';
import { describeDeadline } from '@/lib/jalali';
import { formatFraction } from '@/lib/format';
import { priorityLabel, priorityTone } from '@/data/reference';
import { subtaskProgress, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, IconButton } from '@/components/ui';
import { TaskMetaBadges } from './TaskMetaBadges';
import { CalendarIcon, CheckIcon, ClockIcon, MoreVerticalIcon } from '@/components/icons';

export interface SwipeableTaskRowProps {
  readonly task: Task;
  readonly onOpen: (taskId: string) => void;
  readonly onComplete: (taskId: string) => void;
  readonly onPostpone: (task: Task) => void;
}

/** Past this distance the gesture commits on release. */
const COMMIT_THRESHOLD = 96;
const MAX_TRAVEL = 128;

/**
 * Mobile task row with directional swipe actions.
 *
 * The document is RTL, so "swipe right" (positive deltaX) moves toward the start edge and is
 * bound to "انجام شد"; "swipe left" (negative deltaX) is bound to "تعویق و ارجاع". Both
 * actions also exist as ordinary buttons in the row menu, so the gesture is an accelerator
 * rather than the only route — pointer-only interactions never become the sole path.
 */
export function SwipeableTaskRow({ task, onOpen, onComplete, onPostpone }: SwipeableTaskRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const pointerId = useRef<number | null>(null);

  const progress = subtaskProgress(task);
  const deadline = describeDeadline(task.dueDate, new Date(), task.status === 'done');
  const assignees = usersByIds(task.assigneeIds);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    pointerId.current = event.pointerId;
    startX.current = event.clientX;
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || pointerId.current !== event.pointerId) return;
    const delta = event.clientX - startX.current;
    setOffset(Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, delta)));
  };

  const endGesture = () => {
    if (!dragging) return;
    setDragging(false);
    pointerId.current = null;

    if (offset >= COMMIT_THRESHOLD) {
      onComplete(task.id);
    } else if (offset <= -COMMIT_THRESHOLD) {
      onPostpone(task);
    }
    setOffset(0);
  };

  const revealingComplete = offset > 0;
  const committed = Math.abs(offset) >= COMMIT_THRESHOLD;

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Action layer revealed by the gesture. */}
      <div className="absolute inset-0 flex items-stretch" aria-hidden="true">
        <div
          className={cn(
            'flex flex-1 items-center gap-2 px-4 text-body-sm font-semibold transition-colors',
            revealingComplete ? 'justify-start bg-status-done-subtle text-status-done' : 'opacity-0',
            committed && revealingComplete && 'bg-status-done text-white',
          )}
        >
          <CheckIcon size={20} />
          انجام شد
        </div>
        <div
          className={cn(
            'flex flex-1 items-center gap-2 px-4 text-body-sm font-semibold transition-colors',
            !revealingComplete && offset !== 0
              ? 'justify-end bg-status-progress-subtle text-status-progress'
              : 'opacity-0',
            committed && !revealingComplete && 'bg-status-progress text-white',
          )}
        >
          تعویق و ارجاع
          <ClockIcon size={20} />
        </div>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          'relative flex touch-pan-y items-start gap-3 border border-secondary bg-surface p-3',
          'rounded-xl',
          !dragging && 'transition-transform duration-200',
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="flex min-w-0 flex-1 flex-col gap-2 text-start"
        >
          <span className="flex items-center gap-2">
            <Badge tone={priorityTone(task.priority)} size="sm">
              {priorityLabel(task.priority)}
            </Badge>
            <TaskMetaBadges task={task} compact />
            <span className="numeric latin-inline ms-auto text-micro text-fg-quaternary">{task.code}</span>
          </span>

          <span
            className={cn(
              'line-clamp-2 text-body-sm font-semibold leading-6',
              task.status === 'done' ? 'text-fg-tertiary line-through' : 'text-fg-primary',
            )}
          >
            {task.title}
          </span>

          <span className="flex items-center gap-2">
            <Badge tone={deadline.tone} size="sm" numeric iconStart={<CalendarIcon size={11} />}>
              {deadline.text}
            </Badge>
            {progress.total > 0 && (
              <span className="numeric text-micro text-fg-tertiary">
                {formatFraction(progress.done, progress.total)}
              </span>
            )}
            {assignees.length > 0 && <AvatarStack members={assignees} max={2} size="xs" className="ms-auto" />}
          </span>
        </button>

        {/* Keyboard/AT path for the same two actions. */}
        <span className="flex flex-col gap-1">
          <IconButton
            label={`علامت‌گذاری «${task.title}» به‌عنوان انجام‌شده`}
            icon={<CheckIcon size={16} />}
            size="xs"
            variant="subtle"
            onClick={() => onComplete(task.id)}
          />
          <IconButton
            label={`تعویق یا ارجاع «${task.title}»`}
            icon={<MoreVerticalIcon size={16} />}
            size="xs"
            onClick={() => onPostpone(task)}
          />
        </span>
      </div>
    </li>
  );
}
