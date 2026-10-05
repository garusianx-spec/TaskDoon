'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AvatarTone, ModuleId, PresenceState } from '@/types';
import { MODULES } from '@/data/reference';
import { WORKSPACE, WORKSPACES } from '@/data/workspace';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useShellActions } from './AppShell';
import { Avatar, Button, CountPill, IconButton, Popover, PopoverDivider, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { ThemePicker } from '@/components/theme/ThemePicker';
import {
  AddIcon,
  CalendarIcon,
  CheckIcon,
  DirectoryIcon,
  HomeIcon,
  LogoutIcon,
  MessagesIcon,
  NotificationIcon,
  PaletteIcon,
  PeopleIcon,
  SettingsIcon,
  ShieldIcon,
  TaskSquareIcon,
  UserIcon,
} from '@/components/icons';

const MODULE_ICONS: Readonly<Record<ModuleId, typeof HomeIcon>> = {
  feed: HomeIcon,
  chats: MessagesIcon,
  tasks: TaskSquareIcon,
  calendar: CalendarIcon,
  directory: PeopleIcon,
};

/**
 * Slim 64px vertical rail pinned to the inline-end edge (the right side in RTL).
 * Hidden below `lg`, where `TopAppBar` + `BottomNav` take over.
 */
export function NavRail() {
  const pathname = usePathname();
  const { currentUser, totalUnread } = useWorkspace();

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
          tone={currentUser.avatarTone}
          presence={currentUser.presence}
        />
      </div>
    </nav>
  );
}

function WorkspaceSwitcher() {
  return (
    <Popover
      label="تعویض فضای کاری"
      align="start"
      panelClassName="min-w-64"
      trigger={
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-xl bg-brand-solid text-body-sm font-bold text-fg-on-brand shadow-xs transition-opacity hover:opacity-90"
        >
          <span aria-hidden="true">{WORKSPACE.initials}</span>
          <span className="sr-only">{`فضای کاری فعال: ${WORKSPACE.name} — تعویض فضای کاری`}</span>
        </button>
      }
    >
      {(close) => (
        <MenuList>
          <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            فضاهای کاری
          </p>
          {WORKSPACES.map((workspace) => {
            const active = workspace.id === WORKSPACE.id;
            return (
              <MenuItem
                key={workspace.id}
                selected={active}
                onSelect={close}
                icon={
                  <span className="flex size-7 items-center justify-center rounded-lg bg-sunken text-micro font-bold text-fg-secondary">
                    {workspace.initials}
                  </span>
                }
              >
                <span className="flex flex-col">
                  <span className="truncate">{workspace.name}</span>
                  <span className="numeric text-micro font-normal text-fg-tertiary">
                    {`${formatCount(workspace.memberCount)} عضو`}
                  </span>
                </span>
              </MenuItem>
            );
          })}
          <PopoverDivider />
          <MenuItem onSelect={close} icon={<AddIcon size={18} />}>
            ایجاد فضای کاری جدید
          </MenuItem>
        </MenuList>
      )}
    </Popover>
  );
}

function QuickCreate() {
  return (
    <Popover
      label="ایجاد سریع"
      align="start"
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
      {(close) => (
        <MenuList>
          <MenuItem onSelect={close} icon={<TaskSquareIcon size={18} />} shortcut="N">
            وظیفه جدید
          </MenuItem>
          <MenuItem onSelect={close} icon={<MessagesIcon size={18} />} shortcut="M">
            گفتگوی جدید
          </MenuItem>
          <MenuItem onSelect={close} icon={<CalendarIcon size={18} />}>
            رویداد تقویم
          </MenuItem>
          <MenuItem onSelect={close} icon={<DirectoryIcon size={18} />}>
            دعوت همکار
          </MenuItem>
        </MenuList>
      )}
    </Popover>
  );
}

function NotificationsBell() {
  const { state } = useWorkspace();
  const mentionCount = state.messages.filter(
    (message) => message.body.kind === 'text' && message.readByIds.length === 0,
  ).length;

  return (
    <Popover
      label="اعلان‌ها"
      placement="top"
      align="start"
      panelClassName="min-w-72"
      trigger={
        <span className="relative inline-flex">
          <IconButton label="اعلان‌ها" icon={<NotificationIcon size={21} />} size="lg" />
          {mentionCount > 0 && (
            <CountPill
              value={formatCount(mentionCount)}
              tone="error"
              className="pointer-events-none absolute -top-1 -end-1 ring-2 ring-rail"
            />
          )}
        </span>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-1">
          <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            اعلان‌های خوانده‌نشده
          </p>
          <MenuList>
            <MenuItem onSelect={close} icon={<MessagesIcon size={18} />}>
              پیام‌های اشاره‌شده به شما
            </MenuItem>
            <MenuItem onSelect={close} icon={<TaskSquareIcon size={18} />}>
              وظایف ارجاع‌شده امروز
            </MenuItem>
            <MenuItem onSelect={close} icon={<CheckIcon size={18} />}>
              علامت‌گذاری همه به‌عنوان خوانده‌شده
            </MenuItem>
          </MenuList>
        </div>
      )}
    </Popover>
  );
}

interface ProfileMenuProps {
  readonly fullName: string;
  readonly initials: string;
  readonly jobTitle: string;
  readonly tone: AvatarTone;
  readonly presence: PresenceState;
}

function ProfileMenu({ fullName, initials, jobTitle, tone, presence }: ProfileMenuProps) {
  const { dispatch } = useWorkspace();
  const { openProfile, openSecurity } = useShellActions();

  return (
    <Popover
      label="حساب کاربری"
      placement="top"
      align="start"
      panelClassName="min-w-64"
      trigger={
        <button type="button" className="mt-1 rounded-full">
          <Avatar name={fullName} initials={initials} tone={tone} size="md" presence={presence} />
          <span className="sr-only">{`حساب کاربری — ${fullName}`}</span>
        </button>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={fullName} initials={initials} tone={tone} size="md" decorative />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm font-semibold text-fg-primary">{fullName}</span>
              <span className="truncate text-micro text-fg-tertiary">{jobTitle}</span>
            </span>
          </div>
          <PopoverDivider />
          <MenuList>
            <MenuItem
              icon={<UserIcon size={18} />}
              onSelect={() => {
                close();
                openProfile();
              }}
            >
              پروفایل من
            </MenuItem>
            <MenuItem
              icon={<ShieldIcon size={18} />}
              onSelect={() => {
                close();
                openSecurity();
              }}
            >
              امنیت و ورود
            </MenuItem>
            <PopoverDivider />
            <MenuItem
              icon={<LogoutIcon size={18} />}
              tone="danger"
              onSelect={() => {
                close();
                dispatch({ type: 'sign-out' });
              }}
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
      )}
    </Popover>
  );
}
