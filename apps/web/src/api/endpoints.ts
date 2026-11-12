import { accountEndpoints } from '@/features/account/api/endpoints';
import { adminEndpoints } from '@/features/admin/api/endpoints';
import { workspaceEndpoints } from '@/features/workspace/api/endpoints';
import { boardEndpoints } from '@/features/board/api/endpoints';
import { tasksEndpoints } from '@/features/tasks/api/endpoints';
import { agileEndpoints } from '@/features/agile/api/endpoints';
import { chatEndpoints } from '@/features/chat/api/endpoints';
import { calendarEndpoints } from '@/features/calendar/api/endpoints';
import { notesEndpoints } from '@/features/notes/api/endpoints';
import { fileEndpoints } from '@/api/file-endpoints';

/** REST adapters composed for the cross-feature live workspace store. */
export const api = {
  ...accountEndpoints,
  ...adminEndpoints,
  ...workspaceEndpoints,
  ...boardEndpoints,
  ...tasksEndpoints,
  ...agileEndpoints,
  ...chatEndpoints,
  ...calendarEndpoints,
  ...notesEndpoints,
  ...fileEndpoints,
};
