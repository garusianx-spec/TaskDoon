'use client';

import { usePathname } from 'next/navigation';
import { MODULES } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { CountPill, IconButton, Popover } from '@/components/ui';
import { WorkspaceAvatar } from '@/components/workspace/WorkspaceAvatar';
import { WorkspaceMenu } from '@/components/workspace/WorkspaceMenu';
import { QuickCreateMenu } from './QuickCreateMenu';
import { AddIcon, ChevronDownIcon, NotificationIcon, SearchIcon } from '@/components/icons';

/**
 * Mobile top bar: workspace badge + switcher, quick create, global search and the
 * notification bell. Replaced by `NavRail` from `lg` upward.
 */
export function TopAppBar() {
  const pathname = usePathname();
  const { unreadNotifications, activeWorkspace } = useWorkspace();
  const { active, open } = useOverlays();
  const activeModule = MODULES.find((module) => pathname.startsWith(module.href));

  return (
    <header className="sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-2 border-b border-secondary bg-surface/95 px-3 backdrop-blur lg:hidden">
      <Popover
        label="تعویض فضای کاری"
        align="start"
        haspopup="menu"
        panelClassName="min-w-72"
        trigger={
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors hover:bg-hover"
          >
            <WorkspaceAvatar workspace={activeWorkspace} size="sm" className="size-8" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm font-bold leading-tight text-fg-primary">
                {activeWorkspace.name}
              </span>
              <span className="truncate text-micro leading-tight text-fg-tertiary">
                {activeModule?.label ?? 'فضای کاری'}
              </span>
            </span>
            <ChevronDownIcon size={16} className="shrink-0 text-fg-quaternary" />
          </button>
        }
      >
        {(close) => <WorkspaceMenu close={close} />}
      </Popover>

      <div className="flex-1" />

      <Popover
        label="ایجاد سریع"
        haspopup="menu"
        trigger={<IconButton label="ایجاد سریع" icon={<AddIcon size={20} />} />}
      >
        {(close) => <QuickCreateMenu close={close} />}
      </Popover>
      <IconButton
        label="جستجوی سراسری"
        icon={<SearchIcon size={20} />}
        onClick={() => open({ kind: 'global-search' })}
      />
      <span className="relative inline-flex">
        <IconButton
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
            className="pointer-events-none absolute -top-1 -end-1 ring-2 ring-surface"
          />
        )}
      </span>
    </header>
  );
}
