'use client';

import type { PlatformWorkspaceSummary } from '@taskin/contracts';
import { MenuItem } from '@/components/ui';
import { CheckCircleIcon, CrownIcon, LockIcon, PeopleIcon } from '@/components/icons';
import { FixedMenu } from './FixedMenu';

export type WorkspaceAction = 'view' | 'transfer' | 'suspend' | 'unsuspend';

/** The ⋯ menu of one workspace in the platform list. A deleted workspace can only be looked at. */
export function WorkspaceActionsMenu({ workspace, onAction }: { readonly workspace: PlatformWorkspaceSummary; readonly onAction: (action: WorkspaceAction) => void }) {
  const deleted = workspace.status === 'deleted' || workspace.deletedAt !== null;
  const suspended = workspace.status === 'suspended';
  return (
    <FixedMenu label={`اقدام‌های ${workspace.name}`}>
      {(choose) => (
        <>
          <MenuItem icon={<PeopleIcon size={16} />} onSelect={() => choose(() => onAction('view'))}>
            مشاهده جزئیات و اعضا
          </MenuItem>
          <MenuItem icon={<CrownIcon size={16} />} disabled={deleted} onSelect={() => choose(() => onAction('transfer'))}>
            انتقال مالکیت
          </MenuItem>
          {suspended ? (
            <MenuItem icon={<CheckCircleIcon size={16} />} disabled={deleted} onSelect={() => choose(() => onAction('unsuspend'))}>
              رفع تعلیق
            </MenuItem>
          ) : (
            <MenuItem icon={<LockIcon size={16} />} tone="danger" disabled={deleted} onSelect={() => choose(() => onAction('suspend'))}>
              تعلیق فضای کاری
            </MenuItem>
          )}
        </>
      )}
    </FixedMenu>
  );
}
