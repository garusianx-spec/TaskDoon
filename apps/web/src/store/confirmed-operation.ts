import type { WorkspaceAction, WorkspaceState } from '@/store/workspace-reducer';

export type ConfirmedOperation = Extract<
  WorkspaceAction,
  {
    type:
      | 'create-calendar-event'
      | 'create-conversation'
      | 'delete-project'
      | 'restore-project'
      | 'schedule-message'
      | 'cancel-scheduled-message'
      | 'update-working-hours'
      | 'delete-note';
  }
>;

/** Project names must be read before the operation moves the project between lists. */
export function operationConfirmation(
  operation: ConfirmedOperation,
  state: WorkspaceState,
): string | undefined {
  switch (operation.type) {
    case 'create-calendar-event':
      return `رویداد «${operation.draft.title}» در تقویم ثبت شد.`;
    case 'delete-project': {
      const project = state.projects.find(({ id }) => id === operation.projectId);
      return project && `پروژهٔ «${project.name}» به سطل زباله منتقل شد.`;
    }
    case 'restore-project': {
      const entry = state.projectTrash.find(({ project }) => project.id === operation.projectId);
      return entry && `پروژهٔ «${entry.project.name}» بازیابی شد.`;
    }
    case 'cancel-scheduled-message':
      return 'ارسال زمان‌بندی‌شده لغو شد.';
    case 'update-working-hours':
      return 'ساعات کاری و پاسخ خودکار ذخیره شد.';
    case 'delete-note':
      return 'یادداشت حذف شد.';
    default:
      return undefined;
  }
}
