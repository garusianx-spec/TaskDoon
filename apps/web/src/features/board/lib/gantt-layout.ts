import type { Task } from '@taskin/contracts';

export const BAR_TONE: Readonly<Record<Task['status'], string>> = {
  todo: 'bg-status-todo',
  'in-progress': 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
};

/** Days loaded at once: the timeline scrolls through them and loads more at either end. */

export const WINDOW_DAYS = 12 * 7;
export const GRID_TEMPLATE = `14rem repeat(${WINDOW_DAYS}, 2.5rem)`;
