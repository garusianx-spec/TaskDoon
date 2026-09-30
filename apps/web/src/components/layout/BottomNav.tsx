'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { CountPill } from '@/components/ui';
import {
  CalendarIcon,
  GridIcon,
  HomeIcon,
  MessagesIcon,
  TaskSquareIcon,
} from '@/components/icons';

interface MobileTab {
  readonly href: string;
  readonly label: string;
  readonly Icon: typeof HomeIcon;
}

const TABS: readonly MobileTab[] = [
  { href: '/feed', label: 'میز کار', Icon: HomeIcon },
  { href: '/tasks', label: 'وظایف من', Icon: TaskSquareIcon },
  { href: '/chats', label: 'گفتگوها', Icon: MessagesIcon },
  { href: '/calendar', label: 'تقویم', Icon: CalendarIcon },
  { href: '/more', label: 'بیشتر', Icon: GridIcon },
];

/**
 * Fixed five-tab bottom bar for the mobile shell. Padded for the home indicator and hidden
 * from `lg` upward, where the rail takes over.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { totalUnread } = useWorkspace();

  return (
    <nav
      aria-label="ناوبری پایین"
      className="sticky bottom-0 z-sticky flex shrink-0 items-stretch border-t border-secondary bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        const badge = href === '/chats' && totalUnread > 0 ? formatCount(totalUnread) : null;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors',
              active ? 'text-fg-brand' : 'text-fg-tertiary',
            )}
          >
            <span className="relative">
              <Icon size={22} variant={active ? 'bold' : 'linear'} />
              {badge && (
                <CountPill
                  value={badge}
                  tone="error"
                  className="absolute -top-1 -end-2.5 ring-2 ring-surface"
                />
              )}
            </span>
            <span className={cn('text-micro', active ? 'font-semibold' : 'font-medium')}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
