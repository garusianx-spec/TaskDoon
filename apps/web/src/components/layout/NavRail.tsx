'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ModuleId } from '@taskin/contracts';
import { MODULES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { CountPill,Dropdown,IconButton,Tooltip } from '@/components/ui';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { QuickCreateMenu } from '@/components/layout/QuickCreateMenu';
import {
AddIcon,
CalendarIcon,
HomeIcon,
MessagesIcon,
NotebookIcon,
NotificationIcon,
PeopleIcon,
SettingsIcon,
TaskSquareIcon,
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

      <h2 id="desktop-navigation-title" className="mb-1 text-caption font-medium text-fg-secondary">منو</h2>
      <ul aria-labelledby="desktop-navigation-title" className="flex flex-1 flex-col items-center gap-1">
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
        <ThemeToggle />

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

function QuickCreate() {
  return (
    <Dropdown
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
      {(close) => <QuickCreateMenu close={close} />}
    </Dropdown>
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
