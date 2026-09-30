'use client';

import type { Project } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PROJECT_TRASH_DAYS, type TrashedProject } from '@/store/workspace-reducer';
import { Button, EmptyState, Modal, RelativeTime } from '@/components/ui';
import { ArchiveIcon, FolderIcon, RefreshIcon, TrashIcon } from '@/components/icons';
import { TONE_CLASSES } from '@/components/workspace/WorkspaceAvatar';

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
    <Modal
      open={project !== null}
      onClose={onClose}
      size="sm"
      title={project ? `حذف پروژه «${project.name}»` : 'حذف پروژه'}
      description={`پروژه، وظایف و کانال گفتگوی آن از همه‌جا پنهان می‌شوند و ${formatCount(PROJECT_TRASH_DAYS)} روز در «آرشیو / سطل زباله» می‌مانند.`}
      icon={<TrashIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            انتقال به سطل زباله
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-fg-secondary">
        {`تا ${formatCount(PROJECT_TRASH_DAYS)} روز می‌توانید آن را با همه وظایفش بازیابی کنید؛ پس از آن برای همیشه پاک می‌شود. پیام‌های کانالش پاک نمی‌شوند.`}
      </p>
    </Modal>
  );
}

const DAY = 86_400_000;

/**
 * «آرشیو / سطل زباله» (workspace owner): deleted projects, each with the days it has left and a
 * one-click «بازیابی» that brings it back with its tasks, board and channel.
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
  readonly onRestore: (projectId: string) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="آرشیو / سطل زباله"
      description={`پروژه‌های حذف‌شده تا ${formatCount(PROJECT_TRASH_DAYS)} روز بازیابی‌پذیرند و پس از آن برای همیشه پاک می‌شوند.`}
      icon={<ArchiveIcon size={20} />}
    >
      {entries.length === 0 ? (
        <EmptyState compact icon={<ArchiveIcon size={20} />} title="سطل زباله خالی است" description="پروژه‌ای که حذف کنید اینجا می‌ماند تا بازیابی یا پاک‌سازی شود." />
      ) : (
        <ul aria-label="پروژه‌های حذف‌شده" className="flex flex-col gap-2">
          {entries.map((entry) => {
            const daysLeft = Math.max(0, Math.ceil((Date.parse(entry.purgeAt) - Date.now()) / DAY));
            return (
              <li key={entry.project.id} className="flex items-center gap-3 rounded-xl border border-secondary bg-sunken p-3">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_CLASSES[entry.project.color])}>
                  <FolderIcon size={18} variant="twotone" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-sm font-semibold text-fg-primary">{entry.project.name}</span>
                  <span className="numeric flex flex-wrap items-center gap-x-2 text-caption text-fg-tertiary">
                    <span>{`${formatCount(entry.taskCount)} وظیفه`}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      حذف <RelativeTime iso={entry.deletedAt} />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={daysLeft <= 7 ? 'text-status-blocked' : undefined}>{`${formatCount(daysLeft)} روز تا پاک‌سازی`}</span>
                  </span>
                </span>
                <Button size="sm" variant="secondary" iconStart={<RefreshIcon size={16} />} aria-label={`بازیابی ${entry.project.name}`} onClick={() => onRestore(entry.project.id)}>
                  بازیابی
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
