'use client';

import Link from 'next/link';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { roleLabel } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { Avatar, Badge, Button, Popover } from '@/components/ui';
import { WorkspaceAvatar } from '@/features/workspace/components/WorkspaceAvatar';
import { WorkspaceMenu } from '@/features/workspace/components/WorkspaceMenu';
import {
  ChevronForwardIcon,
  ClockIcon,
  KeyIcon,
  LogoutIcon,
  NotebookIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
  UserAddIcon,
  UserIcon,
} from '@/components/icons';

/**
 * Mobile "بیشتر" tab & desktop settings hub.
 * Redesigned into an Inset-Grouped visual architecture matching modern linear/iOS design patterns.
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

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-6 px-4 py-6 pb-28 sm:px-6">
        {/* Flagship Header: Profile & Active Workspace Card */}
        <section
          aria-label="پروفایل و فضای کاری فعال"
          className="rounded-2xl border border-secondary bg-surface p-5 shadow-xs transition-shadow"
        >
          {/* User Profile Block */}
          <div className="flex items-center gap-4">
            <Avatar
              name={currentUser.fullName}
              initials={currentUser.initials}
              tone={currentUser.avatarTone}
              size="xl"
              presence={currentUser.presence}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-title font-bold text-fg-primary">
                  {currentUser.fullName}
                </span>
                <Badge tone="brand" size="sm">
                  {roleLabel(currentUser.role)}
                </Badge>
              </div>
              <span className="truncate text-caption text-fg-tertiary">
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
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-secondary bg-surface p-2.5 text-fg-secondary transition-colors hover:border-brand hover:bg-hover hover:text-fg-brand active:bg-active"
              aria-label="ویرایش حساب کاربری"
            >
              <UserIcon size={18} />
            </button>
          </div>

          <div className="my-4 border-t border-secondary/60" />

          {/* Active Workspace Block */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceAvatar workspace={activeWorkspace} size="md" />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-semibold text-fg-primary">
                    {activeWorkspace.name}
                  </span>
                  <Badge tone="neutral" size="sm">
                    {activeWorkspace.plan}
                  </Badge>
                </div>
                <span className="truncate text-micro text-fg-tertiary numeric">
                  {`${formatCount(activeWorkspace.memberCount)} عضو تیم`}
                </span>
              </div>
            </div>
            <Popover
              label="تعویض فضای کاری"
              haspopup="menu"
              align="end"
              panelClassName="min-w-72"
              trigger={
                <Button variant="secondary" size="md" className="min-h-[44px]">
                  تعویض
                </Button>
              }
            >
              {(close) => <WorkspaceMenu close={close} />}
            </Popover>
          </div>
        </section>

        {/* Theme & Palette Section */}
        <section
          aria-label="پوسته و رنگ سازمان"
          className="rounded-2xl border border-secondary bg-surface p-5 shadow-xs"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-title-sm font-semibold text-fg-primary">پوسته و رنگ سازمان</h2>
            <span className="text-micro text-fg-tertiary">شخصی‌سازی رابط کاربری</span>
          </div>
          <ThemePicker className="w-full" />
        </section>

        {/* Group 1: Workspace Collaboration Tools */}
        <section aria-label="ابزارهای تیم">
          <h2 className="mb-2 px-2 text-caption font-semibold tracking-wide text-fg-tertiary">
            همکاری و منابع تیم
          </h2>
          <div className="divide-y divide-secondary/40 overflow-hidden rounded-2xl border border-secondary bg-surface shadow-xs">
            <LinkItem
              href="/notes"
              label="یادداشت‌ها و صورت‌جلسات"
              description="دسته‌های شخصی، کاری، ایده‌ها و ثبت صورت‌جلسات تیمی"
              icon={<NotebookIcon size={20} />}
              iconBgClass="bg-brand-50 text-fg-brand dark:bg-brand-950/60 dark:text-brand-300"
            />
            <LinkItem
              href="/directory"
              label="اعضای سازمان"
              description="فهرست همکاران، دپارتمان‌ها و اطلاعات ارتباطی"
              icon={<PeopleIcon size={20} />}
              iconBgClass="bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"
            />
            <LinkItem
              href="/settings/roles"
              label="نقش‌ها و دسترسی‌ها"
              description="ماتریس مجوزها و سطوح دسترسی بخش‌های سازمان"
              icon={<ShieldIcon size={20} />}
              iconBgClass="bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
            />
          </div>
        </section>

        {/* Group 2: Account & Workspace Management */}
        <section aria-label="مدیریت سازمان و امنیت">
          <h2 className="mb-2 px-2 text-caption font-semibold tracking-wide text-fg-tertiary">
            مدیریت و تنظیمات
          </h2>
          <div className="divide-y divide-secondary/40 overflow-hidden rounded-2xl border border-secondary bg-surface shadow-xs">
            <ActionItem
              label="دعوت همکار جدید"
              description="ارسال دعوت‌نامه پیامکی و ایجاد دسترسی برای عضو جدید"
              icon={<UserAddIcon size={20} />}
              iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300"
              onClick={() => open({ kind: 'invite-member' })}
            />
            <ActionItem
              label="امنیت و نشست‌های فعال"
              description="تغییر کلمه عبور، مدیریت دستگاه‌ها و نشست‌های ورود"
              icon={<KeyIcon size={20} />}
              iconBgClass="bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300"
              onClick={() => open({ kind: 'security' })}
            />
            <ActionItem
              label="ساعات کاری و پاسخ خودکار"
              description="تنظیم روزها و زمان پاسخ‌گویی و پیام خارج از دسترس"
              icon={<ClockIcon size={20} />}
              iconBgClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
              onClick={() => open({ kind: 'working-hours' })}
            />
            <ActionItem
              label="تنظیمات فضای کاری"
              description="نام سازمان، لوگو، مالکیت و مدیریت طرح اشتراک"
              icon={<SettingsIcon size={20} />}
              iconBgClass="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              onClick={() => open({ kind: 'workspace-settings' })}
            />
          </div>
        </section>

        {/* Sign Out Card */}
        <section aria-label="خروج از حساب">
          <div className="overflow-hidden rounded-2xl border border-secondary bg-surface shadow-xs">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'sign-out' })}
              className="group flex min-h-[56px] w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors duration-150 hover:bg-status-blocked-subtle active:opacity-90"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-blocked-subtle text-status-blocked transition-transform group-hover:scale-105">
                <LogoutIcon size={20} />
              </span>
              <span className="flex-1 truncate text-body-sm font-semibold text-status-blocked">
                خروج از حساب کاربری
              </span>
              <ChevronForwardIcon
                size={18}
                className="shrink-0 text-status-blocked/60 transition-transform group-hover:translate-x-[-2px]"
              />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

interface ItemBaseProps {
  readonly label: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly iconBgClass: string;
}

interface LinkItemProps extends ItemBaseProps {
  readonly href: string;
}

function LinkItem({ href, label, description, icon, iconBgClass }: LinkItemProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[56px] items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 hover:bg-hover active:bg-active"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconBgClass}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm font-semibold text-fg-primary group-hover:text-fg-brand">
          {label}
        </span>
        <span className="truncate text-micro text-fg-tertiary">{description}</span>
      </span>
      <ChevronForwardIcon
        size={18}
        className="shrink-0 text-fg-quaternary transition-transform group-hover:translate-x-[-2px] group-hover:text-fg-secondary"
      />
    </Link>
  );
}

interface ActionItemProps extends ItemBaseProps {
  readonly onClick: () => void;
}

function ActionItem({ label, description, icon, iconBgClass, onClick }: ActionItemProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      className="group flex min-h-[56px] w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors duration-150 hover:bg-hover active:bg-active"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconBgClass}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm font-semibold text-fg-primary group-hover:text-fg-brand">
          {label}
        </span>
        <span className="truncate text-micro text-fg-tertiary">{description}</span>
      </span>
      <ChevronForwardIcon
        size={18}
        className="shrink-0 text-fg-quaternary transition-transform group-hover:translate-x-[-2px] group-hover:text-fg-secondary"
      />
    </button>
  );
}
