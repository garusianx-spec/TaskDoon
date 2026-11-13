'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { CountPill } from '@/components/ui';
import { FolderIcon, GridIcon, HomeIcon, MessagesIcon, TaskSquareIcon } from '@/components/icons';
import { mobileTabFor, workspaceRoutes } from '@/lib/workspace-navigation';

interface MobileTab {
  readonly href: string;
  readonly label: string;
  readonly Icon: typeof HomeIcon;
}

const TABS: readonly MobileTab[] = [
  { href: workspaceRoutes.today, label: 'امروز', Icon: HomeIcon },
  { href: workspaceRoutes.myTasks, label: 'کارهای من', Icon: TaskSquareIcon },
  { href: workspaceRoutes.projects, label: 'پروژه‌ها', Icon: FolderIcon },
  { href: workspaceRoutes.chats, label: 'گفت‌وگوها', Icon: MessagesIcon },
  { href: workspaceRoutes.more, label: 'بیشتر', Icon: GridIcon },
];

/**
 * Fixed five-tab bottom bar for the mobile shell. Padded for the home indicator and hidden
 * from `lg` upward, where the rail takes over.
 */
export function BottomNav() {
  const pathname = usePathname();
  const currentTab = mobileTabFor(pathname);
  const { totalUnread } = useWorkspace();
  const unreadId = useId();

  return (
    <nav
      aria-label="ناوبری پایین"
      className="sticky bottom-0 z-sticky flex shrink-0 items-stretch border-t border-secondary bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = currentTab === href;
        const badge = href === workspaceRoutes.chats && totalUnread > 0 ? formatCount(totalUnread) : null;

        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            aria-describedby={badge ? unreadId : undefined}
            className="group relative flex min-h-14 min-w-0 flex-1 p-1 focus-visible:z-10 focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <span
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-center text-caption font-semibold transition-colors duration-150',
                active
                  ? 'bg-brand-subtle text-fg-brand group-active:bg-brand-subtle-hover'
                  : 'text-fg-tertiary group-hover:bg-hover group-hover:text-fg-primary group-active:bg-active',
              )}
            >
              <span className="relative inline-flex" aria-hidden="true">
                <Icon size={20} />
                {badge && (
                  <CountPill
                    value={badge}
                    tone="error"
                    className="absolute -end-4 -top-1.5 ring-2 ring-surface"
                  />
                )}
              </span>
              <span className="max-w-full break-words">{label}</span>
            </span>
            {badge && <span id={unreadId} className="sr-only">{`${badge} پیام خوانده‌نشده`}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
