import type { Task } from '@/types';
import { cn } from '@/lib/cn';
import { describeRecurrence, describeRecurrenceFull } from '@/lib/recurrence';
import { describeReminder, describeReminderFull } from '@/lib/reminder';
import { NotificationIcon, RefreshIcon } from '@/components/icons';

export interface TaskMetaBadgesProps {
  readonly task: Task;
  /** `compact` drops the text and keeps only the glyph, for dense card footers. */
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Recurrence and reminder indicators.
 *
 * Both carry a `title` with the full sentence, and the compact variant keeps an `sr-only`
 * label so the glyph is never the only carrier of meaning.
 */
export function TaskMetaBadges({ task, compact = false, className }: TaskMetaBadgesProps) {
  if (!task.recurrence && !task.reminder) return null;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {task.recurrence && (
        <span
          title={describeRecurrenceFull(task.recurrence)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border border-status-review-line bg-status-review-subtle text-status-review',
            compact ? 'size-5 justify-center' : 'h-5 px-1.5 text-micro font-medium',
          )}
        >
          <RefreshIcon size={compact ? 12 : 11} />
          {compact ? (
            <span className="sr-only">{describeRecurrenceFull(task.recurrence)}</span>
          ) : (
            describeRecurrence(task.recurrence)
          )}
        </span>
      )}

      {task.reminder && (
        <span
          title={describeReminderFull(task.dueDate, task.reminder)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border border-status-progress-line bg-status-progress-subtle text-status-progress',
            compact ? 'size-5 justify-center' : 'h-5 px-1.5 text-micro font-medium',
          )}
        >
          <NotificationIcon size={compact ? 12 : 11} />
          {compact ? (
            <span className="sr-only">{describeReminderFull(task.dueDate, task.reminder)}</span>
          ) : (
            describeReminder(task.reminder)
          )}
        </span>
      )}
    </span>
  );
}
