'use client';

import Link from 'next/link';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { useTheme } from '@/components/theme/ThemeProvider';
import { roleLabel } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar, Badge, Button, Popover } from '@/components/ui';
import { WorkspaceAvatar } from '@/features/workspace/components/WorkspaceAvatar';
import { WorkspaceMenu } from '@/features/workspace/components/WorkspaceMenu';
import {
  ChevronForwardIcon,
  ClockIcon,
  KeyIcon,
  LogoutIcon,
  MonitorIcon,
  MoonIcon,
  NotebookIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  UserAddIcon,
  UserIcon,
} from '@/components/icons';

/**
 * Mobile "بیشتر" tab & desktop settings hub.
 * Modern Action Hub architecture:
 * - Unified profile & active workspace pill
 * - 2x2 Quick Action grid with distinct iconography
 * - Compact grouped settings without redundant description clutter
 * - Streamlined inline theme switcher (Light / Dark / System)
 */
export default function MorePage() {
  return (
    <AppShell>
      <MoreContent />
    </AppShell>
  );
}

function MoreContent() {
  const { state, currentUser, activeWorkspace } = useWorkspace();
  const { open } = useOverlays();
  const { theme, setMode } = useTheme();

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5 pb-28 sm:px-6">
        {/* Unified Profile & Workspace Card */}
        <section
          aria-label="پروفایل و فضای کاری فعال"
          className="rounded-2xl border border-secondary bg-surface p-4 shadow-xs sm:p-5"
        >
          {/* User Profile Block */}
          <div className="flex items-center gap-3.5">
            <Avatar
              name={currentUser.fullName}
              initials={currentUser.initials}
              tone={currentUser.avatarTone}
              size="lg"
              presence={currentUser.presence}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-title-sm font-bold text-fg-primary">
                  {currentUser.fullName}
                </span>
                <Badge tone="brand" size="sm">
                  {roleLabel(currentUser.role)}
                </Badge>
              </div>
              <span className="truncate text-micro text-fg-tertiary">
                {state.profile.statusMessage || currentUser.jobTitle}
              </span>
              <span className="truncate text-micro text-fg-quaternary numeric">
                {currentUser.phone || currentUser.email}
              </span>
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'profile' })}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-secondary bg-surface text-fg-secondary transition-colors hover:border-brand hover:bg-hover hover:text-fg-brand active:bg-active"
              aria-label="ویرایش حساب کاربری"
            >
              <UserIcon size={18} />
            </button>
          </div>

          <div className="my-3.5 border-t border-secondary/60" />

          {/* Active Workspace Switcher Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <WorkspaceAvatar workspace={activeWorkspace} size="sm" />
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-body-sm font-semibold text-fg-primary">
                  {activeWorkspace.name}
                </span>
                <span className="text-micro text-fg-tertiary numeric">
                  ({formatCount(activeWorkspace.memberCount)} عضو)
                </span>
              </div>
            </div>
            <Popover
              label="تعویض فضای کاری"
              haspopup="menu"
              align="end"
              panelClassName="min-w-72"
              trigger={
                <Button variant="secondary" size="sm" className="min-h-[36px] text-caption font-medium">
                  تعویض فضا
                </Button>
              }
            >
              {(close) => <WorkspaceMenu close={close} />}
            </Popover>
          </div>
        </section>

        {/* 2x2 Quick Actions Grid */}
        <section aria-label="دسترسی سریع">
          <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-fg-quaternary">
            دسترسی سریع
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href="/notes"
              className="group flex flex-col justify-between rounded-2xl border border-secondary bg-surface p-3.5 shadow-xs transition-all duration-150 hover:border-brand/40 hover:bg-hover active:bg-active"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-fg-brand dark:bg-brand-950/60 dark:text-brand-300">
                  <NotebookIcon size={19} />
                </span>
                <ChevronForwardIcon size={16} className="text-fg-quaternary transition-transform group-hover:translate-x-[-2px]" />
              </div>
              <div className="mt-3">
                <span className="block truncate text-body-sm font-semibold text-fg-primary group-hover:text-fg-brand">
                  یادداشت‌ها و جلسات
                </span>
                <span className="block truncate text-micro text-fg-tertiary">شخصی و تیمی</span>
              </div>
            </Link>

            <Link
              href="/directory"
              className="group flex flex-col justify-between rounded-2xl border border-secondary bg-surface p-3.5 shadow-xs transition-all duration-150 hover:border-blue-500/40 hover:bg-hover active:bg-active"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  <PeopleIcon size={19} />
                </span>
                <ChevronForwardIcon size={16} className="text-fg-quaternary transition-transform group-hover:translate-x-[-2px]" />
              </div>
              <div className="mt-3">
                <span className="block truncate text-body-sm font-semibold text-fg-primary group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  اعضای سازمان
                </span>
                <span className="block truncate text-micro text-fg-tertiary">فهرست همکاران</span>
              </div>
            </Link>

            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'invite-member' })}
              className="group flex flex-col justify-between rounded-2xl border border-secondary bg-surface p-3.5 text-start shadow-xs transition-all duration-150 hover:border-emerald-500/40 hover:bg-hover active:bg-active"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <UserAddIcon size={19} />
                </span>
                <ChevronForwardIcon size={16} className="text-fg-quaternary transition-transform group-hover:translate-x-[-2px]" />
              </div>
              <div className="mt-3">
                <span className="block truncate text-body-sm font-semibold text-fg-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                  دعوت همکار جدید
                </span>
                <span className="block truncate text-micro text-fg-tertiary">ارسال دعوت‌نامه</span>
              </div>
            </button>

            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'working-hours' })}
              className="group flex flex-col justify-between rounded-2xl border border-secondary bg-surface p-3.5 text-start shadow-xs transition-all duration-150 hover:border-indigo-500/40 hover:bg-hover active:bg-active"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  <ClockIcon size={19} />
                </span>
                <ChevronForwardIcon size={16} className="text-fg-quaternary transition-transform group-hover:translate-x-[-2px]" />
              </div>
              <div className="mt-3">
                <span className="block truncate text-body-sm font-semibold text-fg-primary group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  ساعات کاری
                </span>
                <span className="block truncate text-micro text-fg-tertiary">پاسخ خودکار</span>
              </div>
            </button>
          </div>
        </section>

        {/* Compact Settings & Security List */}
        <section aria-label="تنظیمات و دسترسی‌ها">
          <h2 className="mb-2 px-1 text-micro font-semibold uppercase tracking-wider text-fg-quaternary">
            تنظیمات و امنیت
          </h2>
          <div className="divide-y divide-secondary/40 overflow-hidden rounded-2xl border border-secondary bg-surface shadow-xs">
            <Link
              href="/settings/roles"
              className="group flex min-h-[50px] items-center gap-3 px-4 py-3 transition-colors hover:bg-hover active:bg-active"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
                <ShieldIcon size={18} />
              </span>
              <span className="flex-1 truncate text-body-sm font-medium text-fg-primary group-hover:text-fg-brand">
                نقش‌ها و دسترسی‌ها
              </span>
              <ChevronForwardIcon size={16} className="shrink-0 text-fg-quaternary group-hover:text-fg-secondary" />
            </Link>

            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'workspace-settings' })}
              className="group flex min-h-[50px] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-hover active:bg-active"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <SettingsIcon size={18} />
              </span>
              <span className="flex-1 truncate text-body-sm font-medium text-fg-primary group-hover:text-fg-brand">
                تنظیمات فضای کاری
              </span>
              <ChevronForwardIcon size={16} className="shrink-0 text-fg-quaternary group-hover:text-fg-secondary" />
            </button>

            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'security' })}
              className="group flex min-h-[50px] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-hover active:bg-active"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                <KeyIcon size={18} />
              </span>
              <span className="flex-1 truncate text-body-sm font-medium text-fg-primary group-hover:text-fg-brand">
                امنیت و ورود
              </span>
              <ChevronForwardIcon size={16} className="shrink-0 text-fg-quaternary group-hover:text-fg-secondary" />
            </button>
          </div>
        </section>

        {/* Streamlined Inline Theme Mode Switcher */}
        <section aria-label="حالت نمایش">
          <div className="flex items-center justify-between rounded-2xl border border-secondary bg-surface p-3.5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-fg-brand dark:bg-brand-950/60 dark:text-brand-300">
                {theme.mode === 'dark' ? <MoonIcon size={18} /> : theme.mode === 'light' ? <SunIcon size={18} /> : <MonitorIcon size={18} />}
              </span>
              <span className="text-body-sm font-semibold text-fg-primary">حالت نمایش</span>
            </div>
            <div role="radiogroup" aria-label="انتخاب پوسته" className="flex items-center rounded-xl bg-sunken p-1">
              {[
                { id: 'light', label: 'روشن', icon: SunIcon },
                { id: 'dark', label: 'تاریک', icon: MoonIcon },
                { id: 'system', label: 'خودکار', icon: MonitorIcon },
              ].map(({ id, label, icon: Icon }) => {
                const selected = theme.mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(id as any)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium transition-all ${
                      selected
                        ? 'bg-surface font-semibold text-fg-primary shadow-xs'
                        : 'text-fg-tertiary hover:text-fg-secondary'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Sign Out Card */}
        <section aria-label="خروج از حساب">
          <div className="overflow-hidden rounded-2xl border border-secondary bg-surface shadow-xs">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'sign-out' })}
              className="group flex min-h-[50px] w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-150 hover:bg-status-blocked-subtle active:opacity-90"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-blocked-subtle text-status-blocked transition-transform group-hover:scale-105">
                <LogoutIcon size={18} />
              </span>
              <span className="flex-1 truncate text-body-sm font-semibold text-status-blocked">
                خروج از حساب کاربری
              </span>
              <ChevronForwardIcon
                size={16}
                className="shrink-0 text-status-blocked/60 transition-transform group-hover:translate-x-[-2px]"
              />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
