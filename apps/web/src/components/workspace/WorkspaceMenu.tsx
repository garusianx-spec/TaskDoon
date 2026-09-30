'use client';

import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { PopoverDivider } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { AddIcon, SettingsIcon } from '@/components/icons';
import { WorkspaceAvatar } from './WorkspaceAvatar';

export interface WorkspaceMenuProps {
  readonly close: () => void;
}

/**
 * Body of the workspace switcher popover, shared by the desktop rail and the mobile top bar:
 * every workspace (the active one marked), then settings for the active workspace and the
 * entry point for creating a new one.
 */
export function WorkspaceMenu({ close }: WorkspaceMenuProps) {
  const { state, dispatch } = useWorkspace();
  const { open } = useOverlays();

  // Close first so focus returns to the trigger, which the dialog then records as the
  // element to hand focus back to.
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <MenuList>
      <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
        فضاهای کاری
      </p>
      {state.workspaces.map((workspace) => {
        const active = workspace.id === state.activeWorkspaceId;
        return (
          <MenuItem
            key={workspace.id}
            selected={active}
            onSelect={run(() => {
              if (!active) dispatch({ type: 'switch-workspace', workspaceId: workspace.id });
            })}
            icon={<WorkspaceAvatar workspace={workspace} size="sm" />}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">
                {workspace.name}
                {active && <span className="sr-only"> (فعال)</span>}
              </span>
              <span className="numeric text-micro font-normal text-fg-tertiary">
                {`${formatCount(workspace.memberCount)} عضو، طرح ${workspace.plan}`}
              </span>
            </span>
          </MenuItem>
        );
      })}
      <PopoverDivider />
      <MenuItem onSelect={run(() => open({ kind: 'workspace-settings' }))} icon={<SettingsIcon size={18} />}>
        تنظیمات فضای کاری
      </MenuItem>
      <MenuItem onSelect={run(() => open({ kind: 'workspace-create' }))} icon={<AddIcon size={18} />}>
        ایجاد فضای کاری جدید
      </MenuItem>
    </MenuList>
  );
}
