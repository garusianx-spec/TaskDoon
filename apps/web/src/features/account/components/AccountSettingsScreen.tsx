'use client';

import { AppShell } from '@/components/layout/AppShell';
import { NavigationList, NavigationRow, SectionBackLink } from '@/components/layout/NavigationList';
import { WorkspacePageHeader } from '@/components/layout/WorkspacePageHeader';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { Avatar } from '@/components/ui';
import { ClockIcon, LogoutIcon, MonitorIcon, ShieldIcon, UserIcon } from '@/components/icons';
import { useOverlays } from '@/components/overlays/context';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { roleLabel } from '@/data/reference';
import { workspaceRoutes } from '@/lib/workspace-navigation';

export function AccountSettingsScreen() {
  const { currentUser, state } = useWorkspace();
  const { open } = useOverlays();
  return (
    <AppShell>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <WorkspacePageHeader
          title="حساب من"
          backLink={<SectionBackLink href={workspaceRoutes.more}>بیشتر</SectionBackLink>}
        />
        <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-4">
            <Avatar
              name={currentUser.fullName}
              initials={currentUser.initials}
              tone={currentUser.avatarTone}
              size="lg"
              presence={currentUser.presence}
              decorative
            />
            <div className="min-w-0">
              <p className="break-words text-title-sm font-bold text-fg-primary">{currentUser.fullName}</p>
              <p className="break-words text-caption text-fg-secondary">
                {state.profile.statusMessage || currentUser.jobTitle}
              </p>
              <p className="text-caption text-fg-secondary">{roleLabel(currentUser.role)}</p>
            </div>
          </div>
          <NavigationList id="account-preferences" title="تنظیمات شخصی">
            <NavigationRow
              label="پروفایل من"
              detail="نام، وضعیت حضور و پیام وضعیت"
              Icon={UserIcon}
              onClick={() => open({ kind: 'profile' })}
            />
            <NavigationRow
              label="امنیت و ورود"
              Icon={ShieldIcon}
              onClick={() => open({ kind: 'security' })}
            />
            <NavigationRow
              label="ساعات کاری و پاسخ خودکار"
              Icon={ClockIcon}
              onClick={() => open({ kind: 'working-hours' })}
            />
            <NavigationRow href={workspaceRoutes.appearance} label="ظاهر شخصی" Icon={MonitorIcon} />
          </NavigationList>
          <NavigationList id="account-session" title="نشست کاربری">
            <NavigationRow
              label="خروج از حساب کاربری"
              Icon={LogoutIcon}
              danger
              onClick={() => open({ kind: 'sign-out' })}
            />
          </NavigationList>
        </div>
      </div>
    </AppShell>
  );
}

export function PersonalAppearanceScreen() {
  return (
    <AppShell>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <WorkspacePageHeader
          title="ظاهر شخصی"
          backLink={<SectionBackLink href={workspaceRoutes.account}>حساب من</SectionBackLink>}
        />
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <div className="rounded-xl border border-secondary bg-surface p-4">
            <ThemePicker section="mode" className="w-full p-0" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
