'use client';

import { useEffect, useState } from 'react';
import type { Project } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PROJECT_TRASH_DAYS, type TrashedProject } from '@/store/workspace-reducer';
import { Button, Modal, RelativeTime } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormError } from '@/components/shared/FormError';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useFormSubmission } from '@/hooks/useFormSubmission';
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
  readonly onConfirm: () => Promise<void>;
}) {
  const submission = useFormSubmission();
  useResetOnOpen(project !== null, submission.reset, project?.id);
  return (
    <ConfirmDialog
      open={project !== null}
      onClose={() => {
        if (!submission.isPending()) onClose();
      }}
      title={project ? `حذف پروژه «${project.name}»` : 'حذف پروژه'}
      description={`پروژه و وظایف آن تا ${formatCount(PROJECT_TRASH_DAYS)} روز در «آرشیو / سطل زباله» بازیابی‌پذیرند و سپس پاک می‌شوند.`}
      icon={<TrashIcon size={20} />}
      confirmLabel="انتقال به سطل زباله"
      onConfirm={() =>
        void submission.submit(project?.id, onConfirm, 'پروژه به سطل زباله منتقل نشد. دوباره تلاش کنید.')
      }
      busy={submission.saving}
      busyLabel="در حال انتقال…"
      error={submission.error}
    >
      <p className="text-body-sm text-fg-secondary">
        گفتگوی پروژه برای همیشه در بخش «بایگانی» به‌صورت فقط‌خواندنی نگهداری می‌شود.
      </p>
      <p className="text-body-sm text-fg-secondary">
        بازیابی پروژه، گفتگوی بایگانی‌شده را فعال نمی‌کند. حذف دائمی گفتگو فقط از بخش «بایگانی» و با تأیید عضو
        دارای مجوز انجام می‌شود.
      </p>
    </ConfirmDialog>
  );
}

const DAY = 86_400_000;

/**
 * «آرشیو / سطل زباله» (workspace owner): deleted projects, each with the days it has left and a
 * one-click «بازیابی» for its tasks and board. The companion chat stays archived.
 */
export function ProjectTrashModal({
  open,
  entries,
  onClose,
  onLoad,
  onRestore,
}: {
  readonly open: boolean;
  readonly entries: readonly TrashedProject[];
  readonly onClose: () => void;
  readonly onLoad?: () => Promise<void>;
  readonly onRestore: (projectId: string) => Promise<void>;
}) {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<{ attempt: number; ok: boolean } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const submission = useFormSubmission();
  useResetOnOpen(open, () => {
    setLoadResult(null);
    setTarget(null);
    submission.reset();
  });

  useEffect(() => {
    if (!open || !onLoad) return;
    let active = true;
    const settle = (ok: boolean) => {
      if (active) setLoadResult({ attempt: loadAttempt, ok });
    };
    void onLoad().then(
      () => settle(true),
      () => settle(false),
    );
    return () => {
      active = false;
    };
  }, [open, onLoad, loadAttempt]);

  const loading = onLoad !== undefined && loadResult?.attempt !== loadAttempt;
  const failed = !loading && loadResult?.ok === false;
  const restore = async (projectId: string) => {
    if (submission.isPending()) return;
    setTarget(projectId);
    await submission.submit(projectId, () => onRestore(projectId), 'پروژه بازیابی نشد. دوباره تلاش کنید.');
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submission.isPending()) onClose();
      }}
      size="md"
      title="آرشیو / سطل زباله"
      description={`پروژه‌های حذف‌شده تا ${formatCount(PROJECT_TRASH_DAYS)} روز بازیابی‌پذیرند و پس از آن برای همیشه پاک می‌شوند. گفتگوهای آن‌ها در بخش «بایگانی» به‌صورت فقط‌خواندنی باقی می‌مانند.`}
      icon={<ArchiveIcon size={20} />}
    >
      {loading ? (
        <p role="status" className="py-3 text-body-sm text-fg-secondary">
          در حال بارگذاری سطل زباله…
        </p>
      ) : failed ? (
        <div className="flex flex-col items-start gap-3">
          <FormError message="سطل زباله بارگذاری نشد. دوباره تلاش کنید." />
          <Button variant="secondary" onClick={() => setLoadAttempt((value) => value + 1)}>
            تلاش دوباره
          </Button>
        </div>
      ) : entries.length === 0 ? (
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
            return (
              <li
                key={entry.project.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary bg-sunken p-3"
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
                  loading={submission.saving && target === entry.project.id}
                  disabled={submission.saving}
                  onClick={() => void restore(entry.project.id)}
                >
                  {submission.saving && target === entry.project.id ? 'در حال بازیابی…' : 'بازیابی'}
                </Button>
                {target === entry.project.id && (
                  <FormError message={submission.error} className="basis-full" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
