import type { TaskViewMode } from '@taskin/contracts';

export const TASK_VIEW_MODES = ['board', 'list', 'gantt', 'backlog'] as const satisfies readonly TaskViewMode[];

const VIEW_SET = new Set<string>(TASK_VIEW_MODES);

/** Parses `?view=` from `/tasks`; returns `null` when absent or invalid so callers can fall back safely. */
export function parseTaskViewParam(value: string | null | undefined): TaskViewMode | null {
  if (!value || !VIEW_SET.has(value)) return null;
  return value as TaskViewMode;
}

/** Builds the `/tasks` URL for `view`, keeping the default Board URL clean (`view` omitted) while preserving other params. */
export function taskViewHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'toString'>,
  view: TaskViewMode,
): string {
  const params = new URLSearchParams(searchParams.toString());
  if (view === 'board') params.delete('view');
  else params.set('view', view);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
