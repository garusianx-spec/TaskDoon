'use client';

import { usePathname } from 'next/navigation';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { CountPill, IconButton, Dropdown } from '@/components/ui';
import { WorkspaceAvatar } from '@/features/workspace/components/WorkspaceAvatar';
import { WorkspaceMenu } from '@/features/workspace/components/WorkspaceMenu';
import { QuickCreateMenu } from '@/components/layout/QuickCreateMenu';
import { AddIcon, ChevronDownIcon, NotificationIcon, SearchIcon } from '@/components/icons';
import { mobilePageTitle } from '@/lib/workspace-navigation';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * Mobile top bar: workspace badge + switcher, quick create, global search and the
 * notification bell. Replaced by `NavRail` from `lg` upward.
 */
export function TopAppBar({ pageTitle }: { readonly pageTitle?: string }) {
  const pathname = usePathname();
  const { unreadNotifications, activeWorkspace } = useWorkspace();
  const { active, open } = useOverlays();
  const title = pageTitle ?? mobilePageTitle(pathname);

  return (
    <header className="sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-1 border-b border-secondary bg-surface/80 px-3 backdrop-blur-md lg:hidden">
      <Dropdown
        label="تعویض فضای کاری"
        align="start"
        className="min-w-0 flex-1"
        panelClassName="min-w-72"
        trigger={
          <button
            type="button"
            aria-label={`تعویض فضای کاری: ${activeWorkspace.name}`}
            className="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors hover:bg-hover"
          >
            <WorkspaceAvatar workspace={activeWorkspace} size="sm" className="size-8 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span
                title={activeWorkspace.name}
                className="truncate text-body-sm font-bold leading-tight text-fg-primary"
              >
                {activeWorkspace.name}
              </span>
              <span title={title} className="truncate text-caption leading-tight text-fg-tertiary">
                {title ?? 'فضای کاری'}
              </span>
            </span>
            <ChevronDownIcon size={16} className="shrink-0 text-fg-quaternary" />
          </button>
        }
      >
        {(close) => <WorkspaceMenu close={close} />}
      </Dropdown>

      <ThemeToggle placement="bottom" />
      <Dropdown
        label="ایجاد سریع"
        align="end"
        trigger={<IconButton className="size-11" label="ایجاد سریع" icon={<AddIcon size={20} />} />}
      >
        {(close) => <QuickCreateMenu close={close} />}
      </Dropdown>
      <IconButton
        className="size-11"
        label="جستجوی سراسری"
        icon={<SearchIcon size={20} />}
        onClick={() => open({ kind: 'global-search' })}
      />
      <span className="relative inline-flex">
        <IconButton
          className="size-11"
          label={
            unreadNotifications > 0
              ? `اعلان‌ها — ${formatCount(unreadNotifications)} خوانده‌نشده`
              : 'اعلان‌ها'
          }
          icon={<NotificationIcon size={20} />}
          aria-haspopup="dialog"
          aria-expanded={active?.kind === 'notifications'}
          onClick={() => open({ kind: 'notifications' })}
        />
        {unreadNotifications > 0 && (
          <CountPill
            value={formatCount(unreadNotifications)}
            tone="error"
            className="pointer-events-none absolute -end-1 -top-1 ring-2 ring-surface"
          />
        )}
      </span>
    </header>
  );
}
