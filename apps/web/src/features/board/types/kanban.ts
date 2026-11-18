import type { BoardColumn, TagTone, Task } from '@taskin/contracts';
import type { ColumnDisposition } from '@/store/workspace-reducer';

export interface KanbanBoardProps {
  /** The cards to show — already narrowed by the sidebar's filters and the header search. */
  readonly tasks: readonly Task[];
  /** Every task, unfiltered: deleting a column must account for cards the filters hide. */
  readonly allTasks: readonly Task[];
  readonly columns: readonly BoardColumn[];
  /**
   * A project's own board: its columns can be added, renamed and deleted. Views across projects
   * group cards by status, so their (status) columns are not edited. Defaults to `true`.
   */
  readonly editable?: boolean;
  readonly filtered?: boolean;
  readonly onOpenTask: (taskId: string) => void;
  readonly onMoveTask: (taskId: string, columnId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
  readonly onCreateTask: (column: BoardColumn) => void;
  readonly onAddColumn: (title: string, tone: TagTone) => void;
  readonly onRenameColumn: (columnId: string, title: string) => void;
  readonly onRemoveColumn: (columnId: string, disposition: ColumnDisposition) => void;
  readonly selectedTaskId: string | null;
  readonly onAnnounce: (message: string) => void;
}
