'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ModuleId, PresenceState } from '@taskin/contracts';
import { MODULES, PRESENCE_OPTIONS } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { Avatar, Button, CountPill, IconButton, Popover, PopoverDivider, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar';
import { WorkspaceMenu } from '@/components/workspace/WorkspaceMenu';
import { ThemePicker } from '@/components/theme/ThemePicker';
import { QuickCreateMenu } from './QuickCreateMenu';
import {
  AddIcon,
  CalendarIcon,
  HomeIcon,
  LogoutIcon,
  MessagesIcon,
  NotebookIcon,
  NotificationIcon,
  PaletteIcon,
  PeopleIcon,
  SettingsIcon,
  ClockIcon,
  ShieldIcon,
  TaskSquareIcon,
  UserIcon,
} from '@/components/icons';

const MODULE_ICONS: Readonly<Record<ModuleId, typeof HomeIcon>> = {
  feed: HomeIcon,
  chats: MessagesIcon,
  tasks: TaskSquareIcon,
  calendar: CalendarIcon,
  notes: NotebookIcon,
  directory: PeopleIcon,
};

/**
 * Slim 64px vertical rail pinned to the inline-end edge (the right side in RTL).
 * Hidden below `lg`, where `TopAppBar` + `BottomNav` take over.
 */
export function NavRail() {
  const pathname = usePathname();
  const { currentUser, totalUnread, state } = useWorkspace();

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="z-rail hidden w-rail shrink-0 flex-col items-center gap-1 border-s border-secondary bg-rail py-3 lg:flex"
    >
      <WorkspaceSwitcher />
      <QuickCreate />

      <div className="my-2 h-px w-8 bg-gray-200" aria-hidden="true" />

      <ul className="flex flex-1 flex-col items-center gap-1">
        {MODULES.map((module) => {
          const Icon = MODULE_ICONS[module.id];
          const active = pathname.startsWith(module.href);
          const badge = module.id === 'chats' && totalUnread > 0 ? formatCount(totalUnread) : null;

          return (
            <li key={module.id}>
              <Tooltip content={module.label} placement="start">
                <Link
                  href={module.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex size-11 items-center justify-center rounded-xl transition-colors',
                    active
                      ? 'bg-brand-subtle text-fg-brand'
                      : 'text-fg-tertiary hover:bg-hover hover:text-fg-primary',
                  )}
                >
                  <Icon size={22} variant={active ? 'bold' : 'linear'} />
                  <span className="sr-only">{module.label}</span>
                  {badge && (
                    <CountPill
                      value={badge}
                      tone="error"
                      className="absolute -top-1 -end-1 ring-2 ring-rail"
                    />
                  )}
                </Link>
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-center gap-1">
        <Popover
          label="انتخاب پوسته"
          placement="top"
          align="start"
          panelClassName="min-w-0 p-3"
          trigger={<IconButton label="پوسته و رنگ سازمان" icon={<PaletteIcon size={21} />} size="lg" />}
        >
          <ThemePicker />
        </Popover>

        <Tooltip content="نقش‌ها و تنظیمات" placement="start">
          <Link
            href="/settings/roles"
            aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
            className={cn(
              'flex size-10 items-center justify-center rounded-xl transition-colors',
              pathname.startsWith('/settings')
                ? 'bg-brand-subtle text-fg-brand'
                : 'text-fg-tertiary hover:bg-hover hover:text-fg-primary',
            )}
          >
            <SettingsIcon size={21} />
            <span className="sr-only">نقش‌ها و تنظیمات</span>
          </Link>
        </Tooltip>

        <NotificationsBell />
        <ProfileMenu
          fullName={currentUser.fullName}
          initials={currentUser.initials}
          jobTitle={currentUser.jobTitle}
          presence={currentUser.presence}
          statusMessage={state.profile.statusMessage}
        />
      </div>
    </nav>
  );
}

function WorkspaceSwitcher() {
  const { activeWorkspace } = useWorkspace();
  return (
    <Popover
      label="تعویض فضای کاری"
      align="start"
      haspopup="menu"
      panelClassName="min-w-72"
      trigger={
        <button type="button" className="rounded-xl shadow-xs transition-opacity hover:opacity-90">
          <WorkspaceAvatar workspace={activeWorkspace} size="md" />
          <span className="sr-only">{`فضای کاری فعال: ${activeWorkspace.name} — تعویض فضای کاری`}</span>
        </button>
      }
    >
      {(close) => <WorkspaceMenu close={close} />}
    </Popover>
  );
}

function QuickCreate() {
  return (
    <Popover
      label="ایجاد سریع"
      align="start"
      haspopup="menu"
      trigger={
        <IconButton
          label="ایجاد سریع"
          icon={<AddIcon size={22} />}
          size="lg"
          variant="subtle"
          className="mt-1"
        />
      }
    >
      {(close) => <QuickCreateMenu close={close} />}
    </Popover>
  );
}

/** Opens the notification centre; the badge counts unread notifications, not chat messages. */
function NotificationsBell() {
  const { unreadNotifications } = useWorkspace();
  const { active, open } = useOverlays();

  return (
    <span className="relative inline-flex">
      <IconButton
        label={
          unreadNotifications > 0
            ? `اعلان‌ها — ${formatCount(unreadNotifications)} خوانده‌نشده`
            : 'اعلان‌ها'
        }
        icon={<NotificationIcon size={21} />}
        size="lg"
        aria-haspopup="dialog"
        aria-expanded={active?.kind === 'notifications'}
        onClick={() => open({ kind: 'notifications' })}
      />
      {unreadNotifications > 0 && (
        <CountPill
          value={formatCount(unreadNotifications)}
          tone="error"
          className="pointer-events-none absolute -top-1 -end-1 ring-2 ring-rail"
        />
      )}
    </span>
  );
}

interface ProfileMenuProps {
  readonly fullName: string;
  readonly initials: string;
  readonly jobTitle: string;
  readonly presence: PresenceState;
  readonly statusMessage: string;
}

function ProfileMenu({ fullName, initials, jobTitle, presence, statusMessage }: ProfileMenuProps) {
  const { open } = useOverlays();
  const presenceLabel = PRESENCE_OPTIONS.find((option) => option.id === presence)?.label ?? '';

  return (
    <Popover
      label="حساب کاربری"
      placement="top"
      align="start"
      panelClassName="min-w-64"
      trigger={
        <button type="button" className="mt-1 rounded-full">
          <Avatar name={fullName} initials={initials} tone="brand" size="md" presence={presence} decorative />
          <span className="sr-only">{`حساب کاربری — ${fullName}، ${presenceLabel}`}</span>
        </button>
      }
    >
      {(close) => {
        // Close first so focus returns to the avatar, then open the dialog, which records
        // the avatar as the element to hand focus back to when it closes.
        const run = (action: () => void) => () => {
          close();
          action();
        };
        return (
          <>
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={fullName} initials={initials} tone="brand" size="md" presence={presence} decorative />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm font-semibold text-fg-primary">{fullName}</span>
                <span className="truncate text-micro text-fg-tertiary">
                  {statusMessage ? `${presenceLabel}، ${statusMessage}` : `${jobTitle}، ${presenceLabel}`}
                </span>
              </span>
            </div>
            <PopoverDivider />
            <MenuList>
              <MenuItem onSelect={run(() => open({ kind: 'profile' }))} icon={<UserIcon size={18} />}>
                پروفایل من
              </MenuItem>
              <MenuItem onSelect={run(() => open({ kind: 'security' }))} icon={<ShieldIcon size={18} />}>
                امنیت و ورود
              </MenuItem>
              <MenuItem onSelect={run(() => open({ kind: 'working-hours' }))} icon={<ClockIcon size={18} />}>
                ساعات کاری و پاسخ خودکار
              </MenuItem>
              <PopoverDivider />
              <MenuItem
                onSelect={run(() => open({ kind: 'sign-out' }))}
                icon={<LogoutIcon size={18} />}
                tone="danger"
              >
                خروج از حساب
              </MenuItem>
            </MenuList>
            <div className="px-1 pt-1">
              <Button variant="secondary" size="sm" fullWidth onClick={close}>
                بستن
              </Button>
            </div>
          </>
        );
      }}
    </Popover>
  );
}
