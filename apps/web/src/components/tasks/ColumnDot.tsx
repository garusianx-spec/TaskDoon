import type { BoardColumn, TaskStatus } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { TAG_DOT } from '@/lib/tag-tone';

const STATUS_DOT: Readonly<Record<TaskStatus, string>> = {
  todo: 'bg-status-todo',
  'in-progress': 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
};

export const statusDotClass = (status: TaskStatus): string => STATUS_DOT[status];

/** Colour key for a board column: its picked tag tone, or its status tone for built-ins. */
export function columnDotClass(column: BoardColumn): string {
  return column.tone ? TAG_DOT[column.tone] : STATUS_DOT[column.status];
}

export function ColumnDot({ column, className }: { readonly column: BoardColumn; readonly className?: string }) {
  return <span className={cn('size-2 shrink-0 rounded-full', columnDotClass(column), className)} aria-hidden="true" />;
}
