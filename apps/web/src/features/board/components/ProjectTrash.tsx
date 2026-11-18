'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '@taskin/contracts';
import { problemMessage } from '@/lib/api-problem';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PROJECT_TRASH_DAYS, type TrashedProject } from '@/store/workspace-reducer';
import { Button, Modal, RelativeTime } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ArchiveIcon, FolderIcon, RefreshIcon, TrashIcon } from '@/components/icons';
import { TONE_CLASSES } from '@/features/workspace/components/WorkspaceAvatar';

/** Asks before a project goes to the trash: nothing is lost for {@link PROJECT_TRASH_DAYS} days. */
export function ProjectDeleteDialog({
  project,
  onClose,
  onConfirm,
}: {
  readonly project: Project | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={project !== null}
      onClose={onClose}
      title={project ? `حذف پروژه «${project.name}»` : 'حذف پروژه'}
      description={`پروژه و وظایفش تا ${formatCount(PROJECT_TRASH_DAYS)} روز از «آرشیو / سطل زباله» بازیابی‌پذیرند.`}
      icon={<TrashIcon size={20} />}
      confirmLabel="انتقال به سطل زباله"
      onConfirm={onConfirm}
    >
      <p className="text-body-sm text-fg-secondary">
        گفتگوی پروژه در بخش «بایگانی» گفتگوها به‌صورت فقط‌خواندنی باقی می‌ماند. بازیابی پروژه، گفتگو را دوباره
        فعال نمی‌کند.
      </p>
    </ConfirmDialog>
  );
}

const DAY = 86_400_000;

/**
 * «آرشیو / سطل زباله» (workspace owner): deleted projects, each with the days it has left and a
 * one-click «بازیابی» for its tasks and board. The project conversation stays archived.
 */
export function ProjectTrashModal({
  open,
  entries,
  onClose,
  onRestore,
}: {
  readonly open: boolean;
  readonly entries: readonly TrashedProject[];
  readonly onClose: () => void;
  readonly onRestore: (projectId: string) => Promise<void> | void;
}) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restoringRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      restoringRef.current = null;
      setRestoringId(null);
      setError(null);
    }
  }, [open]);

  const handleClose = () => {
    if (restoringRef.current !== null) return;
    onClose();
  };

  const handleRestore = async (projectId: string) => {
    if (restoringRef.current !== null) return;
    restoringRef.current = projectId;
    setRestoringId(projectId);
    setError(null);
    try {
      await onRestore(projectId);
    } catch (err) {
      setError(problemMessage(err, 'بازیابی پروژه ممکن نشد. دوباره تلاش کنید.'));
    } finally {
      restoringRef.current = null;
      setRestoringId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      dismissOnOverlayClick={restoringId === null}
      size="md"
      title="آرشیو / سطل زباله"
      description={`پروژه‌های حذف‌شده تا ${formatCount(PROJECT_TRASH_DAYS)} روز بازیابی‌پذیرند و پس از آن پاک می‌شوند. گفتگوهایشان در بایگانی گفتگوها باقی می‌ماند.`}
      icon={<ArchiveIcon size={20} />}
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-status-blocked/25 bg-status-blocked-subtle px-3.5 py-2.5 text-body-sm text-status-blocked"
        >
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <EmptyState
          compact
          icon={<ArchiveIcon size={20} />}
          title="سطل زباله خالی است"
          description="پروژه‌ای که حذف کنید اینجا می‌ماند تا بازیابی یا پاک‌سازی شود."
        />
      ) : (
        <ul aria-label="پروژه‌های حذف‌شده" className="flex flex-col gap-2">
          {entries.map((entry) => {
            const daysLeft = Math.max(0, Math.ceil((Date.parse(entry.purgeAt) - Date.now()) / DAY));
            const restoring = restoringId === entry.project.id;
            return (
              <li
                key={entry.project.id}
                className="flex items-center gap-3 rounded-xl border border-secondary bg-sunken p-3"
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    TONE_CLASSES[entry.project.color],
                  )}
                >
                  <FolderIcon size={18} variant="twotone" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-sm font-semibold text-fg-primary">
                    {entry.project.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-caption text-fg-tertiary numeric">
                    <span>{`${formatCount(entry.taskCount)} وظیفه`}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      حذف <RelativeTime iso={entry.deletedAt} />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={daysLeft <= 7 ? 'text-status-blocked' : undefined}
                    >{`${formatCount(daysLeft)} روز تا پاک‌سازی`}</span>
                  </span>
                </span>
                <Button
                  size="sm"
                  className="max-sm:min-h-11"
                  variant="secondary"
                  iconStart={<RefreshIcon size={16} />}
                  aria-label={`بازیابی ${entry.project.name}`}
                  loading={restoring}
                  disabled={restoringId !== null}
                  onClick={() => void handleRestore(entry.project.id)}
                >
                  {restoring ? 'در حال بازیابی…' : 'بازیابی'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
