'use client';

import type { User, Workspace } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { Badge, Button, Modal } from '@/components/ui';
import { CrownIcon, GridIcon, LockIcon, TrashIcon } from '@/components/icons';
import { WorkspaceAvatar } from './WorkspaceAvatar';

export interface WorkspaceSettingsModalProps {
  readonly open: boolean;
  readonly workspace: Workspace;
  readonly owner: User | undefined;
  readonly isOwner: boolean;
  /** Deleting the last workspace is refused, so the app always has one to open. */
  readonly isLastWorkspace: boolean;
  readonly onClose: () => void;
  readonly onRequestDelete: () => void;
}

/** Workspace overview with an Owner-only danger zone for deletion. */
export function WorkspaceSettingsModal({
  open,
  workspace,
  owner,
  isOwner,
  isLastWorkspace,
  onClose,
  onRequestDelete,
}: WorkspaceSettingsModalProps) {
  const lockedReason = !isOwner
    ? `فقط مالک فضای کاری${owner ? ` (${owner.fullName})` : ''} می‌تواند آن را حذف کند.`
    : isLastWorkspace
      ? 'این تنها فضای کاری شماست؛ پیش از حذف، فضای کاری دیگری بسازید.'
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="تنظیمات فضای کاری"
      icon={<GridIcon size={20} />}
      footer={
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex items-center gap-4 rounded-xl border border-secondary bg-sunken p-4">
          <WorkspaceAvatar workspace={workspace} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-title font-bold text-fg-primary">{workspace.name}</span>
            {workspace.description && <span className="text-caption text-fg-tertiary">{workspace.description}</span>}
            <span className="numeric flex flex-wrap items-center gap-2 text-micro text-fg-tertiary">
              {`${formatCount(workspace.memberCount)} عضو، طرح ${workspace.plan}`}
              {owner && (
                <Badge tone="neutral" size="sm" iconStart={<CrownIcon size={11} />}>
                  {`مالک: ${owner.fullName}`}
                </Badge>
              )}
            </span>
          </div>
        </section>

        <section
          aria-labelledby="workspace-danger"
          className="flex flex-col gap-3 rounded-xl border border-status-blocked-line bg-status-blocked-subtle/40 p-4"
        >
          <h3 id="workspace-danger" className="text-title-sm font-semibold text-status-blocked">
            منطقه خطر
          </h3>
          <p className="text-caption text-fg-secondary">
            حذف فضای کاری همه وظایف، گفتگوها، یادداشت‌ها و رویدادهای آن را برای همه اعضا برای همیشه پاک می‌کند.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              size="sm"
              iconStart={<TrashIcon size={16} />}
              disabled={lockedReason !== null}
              aria-describedby={lockedReason ? 'workspace-delete-locked' : undefined}
              onClick={onRequestDelete}
            >
              حذف فضای کاری
            </Button>
            {lockedReason && (
              <span
                id="workspace-delete-locked"
                className="inline-flex items-center gap-1.5 text-caption text-fg-tertiary"
              >
                <LockIcon size={14} />
                {lockedReason}
              </span>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
