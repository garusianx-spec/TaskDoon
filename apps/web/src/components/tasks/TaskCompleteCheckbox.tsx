'use client';

import type { SyntheticEvent } from 'react';
import type { Task } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { Checkbox } from '@/components/ui';

export interface TaskCompleteCheckboxProps {
  readonly task: Task;
  readonly onToggle: (completed: boolean) => void;
  readonly className?: string;
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Quick-complete control for task cards and rows. It sits inside surfaces that are
 * themselves activators (a card that opens on click, grabs on Space and opens on Enter
 * key-up; a table row that opens on Enter/Space), so it stops the click and every key event
 * at its own boundary — toggling it never also opens, grabs or drags the task.
 */
export function TaskCompleteCheckbox({ task, onToggle, className }: TaskCompleteCheckboxProps) {
  const done = task.status === 'done';
  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      onClick={stop}
      onKeyDown={stop}
      onKeyUp={stop}
      onDoubleClick={stop}
    >
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        ariaLabel={`انجام شد: ${task.title}`}
        size="sm"
        tone="success"
      />
    </span>
  );
}

/** Title treatment for a completed task: struck through and muted, still AA-legible. */
export const completedTitleClass = 'text-fg-secondary line-through decoration-1 opacity-75';
