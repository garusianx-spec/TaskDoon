'use client';

import Link from 'next/link';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { roleLabel } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { ThemePicker } from '@/components/theme/ThemePicker';
import { Avatar, Badge, Button, Popover } from '@/components/ui';
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar';
import { WorkspaceMenu } from '@/components/workspace/WorkspaceMenu';
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

const LINKS = [
  { href: '/notes', label: 'یادداشت‌ها', description: 'دسته‌های شخصی، کاری، ایده‌ها و صورت‌جلسه‌ها', Icon: NotebookIcon },
  { href: '/directory', label: 'اعضای سازمان', description: 'فهرست همکاران و اطلاعات تماس', Icon: PeopleIcon },
  { href: '/settings/roles', label: 'نقش‌ها و دسترسی‌ها', description: 'مدیریت سطوح دسترسی', Icon: ShieldIcon },
] as const;

/** Mobile "بیشتر" tab: profile, theme switcher, notes, directory and account actions. */
export default function MorePage() {
  return (
    <AppShell>
      <MoreContent />
    </AppShell>
  );
}

function MoreContent() {
  const { currentUser, state, activeWorkspace } = useWorkspace();
  const { open } = useOverlays();

  return (
    <div className="scrollbar-thin h-full overflow-y-auto p-4">
      <section className="mb-5 flex items-center gap-3 rounded-xl border border-secondary bg-surface p-4 shadow-xs">
        <Avatar
          name={currentUser.fullName}
          initials={currentUser.initials}
          tone={currentUser.avatarTone}
          size="xl"
          presence={currentUser.presence}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-title font-bold text-fg-primary">{currentUser.fullName}</span>
          <span className="truncate text-caption text-fg-tertiary">
            {state.profile.statusMessage || currentUser.jobTitle}
          </span>
          <Badge tone="brand" size="sm" className="self-start">
            {roleLabel(currentUser.role)}
          </Badge>
        </div>
      </section>

      <section className="mb-5 flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3 shadow-xs">
        <WorkspaceAvatar workspace={activeWorkspace} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-caption font-medium text-fg-tertiary">فضای کاری فعال</h2>
          <p className="truncate text-body-sm font-semibold text-fg-primary">{activeWorkspace.name}</p>
          <p className="numeric truncate text-micro text-fg-tertiary">
            {`${formatCount(activeWorkspace.memberCount)} عضو، طرح ${activeWorkspace.plan}`}
          </p>
        </div>
        <Popover
          label="تعویض فضای کاری"
          haspopup="menu"
          align="end"
          panelClassName="min-w-72"
          trigger={
            <Button variant="secondary" size="sm">
              تعویض
            </Button>
          }
        >
          {(close) => <WorkspaceMenu close={close} />}
        </Popover>
      </section>

      <section className="mb-5 rounded-xl border border-secondary bg-surface p-3 shadow-xs">
        <h2 className="mb-2 px-1 text-title-sm font-semibold text-fg-primary">پوسته و رنگ سازمان</h2>
        <ThemePicker className="w-full" />
      </section>

      <nav aria-label="تنظیمات بیشتر" className="flex flex-col gap-2">
        {LINKS.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3.5 shadow-xs transition-colors hover:border-brand"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
              <Icon size={20} variant="twotone" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-semibold text-fg-primary">{label}</span>
              <span className="truncate text-micro text-fg-tertiary">{description}</span>
            </span>
            <ChevronForwardIcon size={18} className="shrink-0 text-fg-quaternary" />
          </Link>
        ))}

        <ActionRow
          label="دعوت همکار"
          description="دعوت با ایمیل یا شماره موبایل، نقش و دپارتمان"
          icon={<UserAddIcon size={20} variant="twotone" />}
          onClick={() => open({ kind: 'invite-member' })}
        />
        <ActionRow
          label="پروفایل من"
          description="وضعیت حضور و پیام وضعیت"
          icon={<UserIcon size={20} variant="twotone" />}
          onClick={() => open({ kind: 'profile' })}
        />
        <ActionRow
          label="امنیت و ورود"
          description="رمز عبور، ورود دومرحله‌ای و نشست‌ها"
          icon={<KeyIcon size={20} variant="twotone" />}
          onClick={() => open({ kind: 'security' })}
        />
        <ActionRow
          label="ساعات کاری و پاسخ خودکار"
          description="روزها و ساعت‌های کاری و پاسخ پیام‌های مستقیم بیرون از آن‌ها"
          icon={<ClockIcon size={20} />}
          onClick={() => open({ kind: 'working-hours' })}
        />

        <ActionRow
          label="تنظیمات فضای کاری"
          description="مالکیت، طرح اشتراک و حذف فضای کاری"
          icon={<SettingsIcon size={20} />}
          onClick={() => open({ kind: 'workspace-settings' })}
        />

        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => open({ kind: 'sign-out' })}
          className="mt-2 flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3.5 text-start text-status-blocked shadow-xs transition-colors hover:border-status-blocked-line"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-status-blocked-subtle">
            <LogoutIcon size={20} />
          </span>
          <span className="flex-1 text-body-sm font-semibold">خروج از حساب کاربری</span>
        </button>
      </nav>
    </div>
  );
}

interface ActionRowProps {
  readonly label: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly onClick: () => void;
}

function ActionRow({ label, description, icon, onClick }: ActionRowProps) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3.5 text-start shadow-xs transition-colors hover:border-brand"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm font-semibold text-fg-primary">{label}</span>
        <span className="truncate text-micro text-fg-tertiary">{description}</span>
      </span>
      <ChevronForwardIcon size={18} className="shrink-0 text-fg-quaternary" />
    </button>
  );
}
