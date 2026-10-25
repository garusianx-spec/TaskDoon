import type { TaskDraft } from '@taskin/contracts';
import { directory } from '@/store/directory';
import { toISODate } from '@taskin/jalali';

/**
 * A blank task draft with the given fields filled in. Every entry point into the composer
 * (board column, calendar day, chat message, note) starts here, so adding a draft field
 * means touching one default rather than every caller.
 */
export function taskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  const today = toISODate(new Date());
  return {
    title: '',
    description: '',
    projectId: directory.projects()[0]?.id ?? '',
    status: 'todo',
    boardColumnId: null,
    priority: 'medium',
    assigneeIds: [],
    startDate: overrides.dueDate && overrides.dueDate < today ? overrides.dueDate : today,
    dueDate: null,
    sourceMessageId: null,
    sourceNoteId: null,
    subtaskTitles: [],
    attachments: [],
    ...overrides,
  };
}
