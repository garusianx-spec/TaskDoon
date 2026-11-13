'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

  return (
    <nav
      aria-label="ناوبری پایین"
      className="sticky bottom-0 z-sticky flex shrink-0 items-stretch border-t border-secondary bg-surface/95 backdrop-blur lg:hidden"
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
            className={cn(
              'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-colors',
              'focus-visible:z-10 focus-visible:ring-inset',
              active ? 'text-fg-brand' : 'text-fg-tertiary hover:text-fg-primary',
            )}
          >
            <span
              className={cn(
                'relative flex h-6 w-9 items-center justify-center rounded-full',
                active && 'bg-brand-subtle',
              )}
            >
              <Icon size={20} variant={active ? 'bold' : 'linear'} />
              {badge && (
                <CountPill
                  value={badge}
                  tone="error"
                  className="absolute -end-2.5 -top-1 ring-2 ring-surface"
                />
              )}
            </span>
            <span
              className={cn(
                'max-w-full break-words text-caption leading-tight',
                active ? 'font-bold' : 'font-medium',
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
