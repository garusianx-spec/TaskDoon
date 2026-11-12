'use client';

import { Dropdown } from '@/components/ui';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { WorkspaceAvatar } from '@/features/workspace/components/WorkspaceAvatar';
import { WorkspaceMenu } from '@/features/workspace/components/WorkspaceMenu';

export function WorkspaceSwitcher() {
  const { activeWorkspace } = useWorkspace();
  return (
    <Dropdown
      label="تعویض فضای کاری"
      align="start"
      panelClassName="min-w-72"
      trigger={
        <button type="button" className="rounded-xl shadow-xs transition-opacity hover:opacity-90">
          <WorkspaceAvatar workspace={activeWorkspace} size="md" />
          <span className="sr-only">{`فضای کاری فعال: ${activeWorkspace.name} — تعویض فضای کاری`}</span>
        </button>
      }
    >
      {(close) => <WorkspaceMenu close={close} />}
    </Dropdown>
  );
}
