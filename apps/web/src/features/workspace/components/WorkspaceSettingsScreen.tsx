'use client';

import { AppShell } from '@/components/layout/AppShell';
import { NavigationList, NavigationRow, SectionBackLink } from '@/components/layout/NavigationList';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { useOverlays } from '@/components/overlays/context';
import { GridIcon, ShieldIcon } from '@/components/icons';
import { formatCount } from '@/lib/format';
import { workspaceRoutes } from '@/lib/workspace-navigation';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { userById } from '@/store/selectors';
import { WorkspaceAvatar } from '@/features/workspace/components/WorkspaceAvatar';

export function WorkspaceSettingsScreen() {
  const { activeWorkspace, currentUser, isWorkspaceOwner, state } = useWorkspace();
  const { open } = useOverlays();
  const owner = userById(activeWorkspace.ownerId);
  const canViewRoles = isWorkspaceOwner || state.permissions[currentUser.role].members.view;

  return (
    <AppShell>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-6 pt-2 sm:px-6">
          <header className="flex flex-col gap-2">
            <SectionBackLink href={workspaceRoutes.more}>بیشتر</SectionBackLink>
            <h1 className="text-heading font-bold text-fg-primary">تنظیمات فضای کاری</h1>
          </header>
          <section
            aria-label="طرح و مالک فضای کاری"
            className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-4"
          >
            <WorkspaceAvatar workspace={activeWorkspace} size="lg" className="shrink-0" />
            <div className="min-w-0">
              <h2 className="break-words text-title-sm font-bold text-fg-primary">{activeWorkspace.name}</h2>
              <p className="text-caption text-fg-secondary numeric">{`طرح ${activeWorkspace.plan} · ${formatCount(activeWorkspace.memberCount)} عضو`}</p>
              {owner && (
                <p className="break-words text-caption text-fg-secondary">{`مالک فضای کاری ${owner.fullName}`}</p>
              )}
            </div>
          </section>
          <NavigationList id="workspace-management" title="مدیریت">
            {canViewRoles && (
              <NavigationRow href="/settings/roles" label="نقش‌ها و سطوح دسترسی" Icon={ShieldIcon} />
            )}
            <NavigationRow
              label="مدیریت فضای کاری"
              Icon={GridIcon}
              onClick={() => open({ kind: 'workspace-settings' })}
            />
          </NavigationList>
          <section aria-label="رنگ و پیش‌نمایش" className="rounded-xl border border-secondary bg-surface p-4">
            <ThemePicker section="accent" className="w-full p-0" />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
