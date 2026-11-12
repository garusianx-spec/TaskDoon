'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardColumn, Task } from '@taskin/contracts';
import { statusLabel } from '@/data/reference';
import { columnForTask, tasksInColumn } from '@/store/selectors';
import { useNamespacedId } from '@/hooks/useId';
import { type KanbanBoardProps } from '@/features/board/types/kanban';

export function useKanbanBoard({
  tasks,
  allTasks,
  columns,
  onMoveTask,
  onRemoveColumn,
  onAnnounce,
}: Pick<
  KanbanBoardProps,
  'tasks' | 'allTasks' | 'columns' | 'onMoveTask' | 'onRemoveColumn' | 'onAnnounce'
>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const knownColumns = useRef<readonly string[]>(columns.map((column) => column.id));
  const hintId = useNamespacedId('kanban-hint-');

  /**
   * Smooth-scrolls to the board's far end, where new columns appear. In RTL that is the left
   * edge, which browsers address with a *negative* `scrollLeft`.
   */
  const revealBoardEnd = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const overflow = board.scrollWidth - board.clientWidth;
    const rtl = getComputedStyle(board).direction === 'rtl';
    board.scrollTo({ left: rtl ? -overflow : overflow, behavior: 'smooth' });
  }, []);

  // A column just added sits next to the add card at the far end; keep that end in view.
  useEffect(() => {
    const added = columns.some((column) => !knownColumns.current.includes(column.id));
    knownColumns.current = columns.map((column) => column.id);
    if (added) requestAnimationFrame(revealBoardEnd);
  }, [columns, revealBoardEnd]);

  // A column holds its own project's cards only.
  const columnLoad = (column: BoardColumn): number =>
    tasksInColumn(
      allTasks.filter((task) => column.projectId === undefined || task.projectId === column.projectId),
      columns,
      column,
    ).length;

  const requestDelete = (column: BoardColumn) => {
    if (columnLoad(column) === 0) {
      onRemoveColumn(column.id, { kind: 'archive' });
    } else {
      setDeleting(column);
    }
  };

  const commitMove = useCallback(
    (taskId: string, column: BoardColumn, viaKeyboard: boolean) => {
      onMoveTask(taskId, column.id);
      const task = tasks.find((entry) => entry.id === taskId);
      if (task) onAnnounce(`وظیفه «${task.title}» به ستون ${column.title} منتقل شد.`);
      if (viaKeyboard) {
        // Focus follows the card across the DOM move.
        requestAnimationFrame(() => cardRefs.current.get(taskId)?.focus());
      }
    },
    [onMoveTask, onAnnounce, tasks],
  );

  const handleCardKeyDown = useCallback(
    (task: Task) => (event: React.KeyboardEvent<HTMLElement>) => {
      // Keys typed inside the card's own controls (the checkbox) are theirs to handle.
      if (event.target !== event.currentTarget) return;
      const current = columnForTask(columns, task);

      if (event.key === ' ') {
        event.preventDefault();
        if (grabbedId === task.id) {
          setGrabbedId(null);
          onAnnounce(`وظیفه «${task.title}» در ستون ${current?.title ?? statusLabel(task.status)} رها شد.`);
        } else {
          setGrabbedId(task.id);
          onAnnounce(
            `وظیفه «${task.title}» برداشته شد. با کلیدهای جهت‌نما جابه‌جا کنید و با فاصله رها کنید.`,
          );
        }
        return;
      }

      if (event.key === 'Escape' && grabbedId === task.id) {
        event.preventDefault();
        setGrabbedId(null);
        onAnnounce('جابه‌جایی لغو شد.');
        return;
      }

      if (grabbedId !== task.id) return;

      // RTL board: ArrowLeft advances to the next column, ArrowRight goes back.
      const delta = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
      if (delta === 0) return;

      event.preventDefault();
      const columnIndex = columns.findIndex((column) => column.id === current?.id);
      const nextColumn = columns[columnIndex + delta];
      if (!nextColumn) {
        onAnnounce(delta > 0 ? 'انتهای بورد است.' : 'ابتدای بورد است.');
        return;
      }
      commitMove(task.id, nextColumn, true);
    },
    [grabbedId, columns, commitMove, onAnnounce],
  );

  return {
    draggingId,
    setDraggingId,
    dropTarget,
    setDropTarget,
    grabbedId,
    renamingId,
    setRenamingId,
    deleting,
    setDeleting,
    boardRef,
    cardRefs,
    hintId,
    revealBoardEnd,
    columnLoad,
    requestDelete,
    commitMove,
    handleCardKeyDown,
  };
}
