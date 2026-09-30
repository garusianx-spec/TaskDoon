import type { TaskDraft } from '@taskin/contracts';
import { directory } from '@/store/directory';

/**
 * A blank task draft with the given fields filled in. Every entry point into the composer
 * (board column, calendar day, chat message, note) starts here, so adding a draft field
 * means touching one default rather than every caller.
 */
export function taskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: '',
    description: '',
    projectId: directory.projects()[0]?.id ?? '',
    status: 'todo',
    boardColumnId: null,
    priority: 'medium',
    assigneeIds: [],
    dueDate: null,
    sourceMessageId: null,
    sourceNoteId: null,
    subtaskTitles: [],
    attachments: [],
    ...overrides,
  };
}
