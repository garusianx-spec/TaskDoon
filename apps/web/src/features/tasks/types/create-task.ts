import type { BoardColumn,TaskDraft } from '@taskin/contracts';


export interface CreateTaskModalProps {
  readonly open: boolean;
  readonly draft: TaskDraft | null;
  /** Every project's board columns, custom ones included; the chosen project's are offered. */
  readonly columns: readonly BoardColumn[];
  /** Calendar dates follow this workspace zone; omitted for device-local demo data. */
  readonly timeZone?: string;
  /** A project view locks placement; global entry points keep the project selector. */
  readonly fixedProjectId?: string;
  readonly onClose: () => void;
  readonly onSubmit: (draft: TaskDraft, files: readonly File[], commandId: string) => Promise<void> | void;
  /** Offered when there is no project yet: every task belongs to one. */
  readonly onCreateProject?: () => void;
}
