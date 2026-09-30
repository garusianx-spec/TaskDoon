'use client';

import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { formatJalali } from '@taskin/jalali';
import { projectById, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, Button } from '@/components/ui';
import { TaskCompleteCheckbox } from '@/components/tasks/TaskCompleteCheckbox';
import { AddIcon, CalendarIcon } from '@/components/icons';
import { ItemIcon, itemKindLabel, itemTimeLabel, itemTitle, itemTone } from './calendar-item';

export interface DaySummaryProps {
  readonly date: string;
  readonly items: readonly CalendarItem[];
  readonly today: Date;
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
  readonly onCreateTask: () => void;
  readonly onCreateEvent: () => void;
}

/** Everything scheduled on one day — the body of the "+X مورد دیگر" popover. */
export function DaySummary({
  date,
  items,
  today,
  onOpenTask,
  onToggleComplete,
  onCreateTask,
  onCreateEvent,
}: DaySummaryProps) {
  return (
    <div className="flex w-72 flex-col gap-2 p-1">
      <div className="flex items-baseline gap-2 px-1.5 pt-1">
        <h3 className="text-body-sm font-bold text-fg-primary">{formatJalali(date, 'long')}</h3>
        <Badge tone="neutral" size="sm" numeric className="ms-auto">
          {`${formatCount(items.length)} مورد`}
        </Badge>
      </div>

      <ul className="scrollbar-thin flex max-h-72 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const time = itemTimeLabel(item);
          const project =
            item.kind === 'deadline'
              ? projectById(item.task.projectId)
              : item.event.projectId
                ? projectById(item.event.projectId)
                : undefined;
          const people = usersByIds(item.kind === 'deadline' ? item.task.assigneeIds : item.event.attendeeIds);

          const body = (
            <>
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', itemTone(item, today))}>
                <ItemIcon item={item} size={15} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="line-clamp-2 text-caption font-semibold text-fg-primary">{itemTitle(item)}</span>
                <span className="numeric truncate text-micro text-fg-tertiary">
                  {[itemKindLabel(item), time, project?.name].filter(Boolean).join('، ')}
                </span>
              </span>
              {people.length > 0 && <AvatarStack members={people} max={2} size="xs" className="mt-1" />}
            </>
          );

          return (
            <li key={item.id} className="flex items-start gap-1 rounded-lg transition-colors hover:bg-hover">
              {item.kind === 'deadline' ? (
                <>
                  <TaskCompleteCheckbox
                    task={item.task}
                    onToggle={(completed) => onToggleComplete(item.task.id, completed)}
                    className="ms-2 mt-3"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenTask(item.task.id)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-2 text-start"
                  >
                    {body}
                  </button>
                </>
              ) : (
                <div className="flex min-w-0 flex-1 items-start gap-2.5 p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-1.5 border-t border-secondary px-1 pt-2">
        <Button size="xs" variant="secondary" fullWidth iconStart={<AddIcon size={14} />} onClick={onCreateTask}>
          وظیفه جدید
        </Button>
        <Button size="xs" variant="secondary" fullWidth iconStart={<CalendarIcon size={14} />} onClick={onCreateEvent}>
          رویداد جدید
        </Button>
      </div>
    </div>
  );
}
