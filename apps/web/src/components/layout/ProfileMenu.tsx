'use client';

import { useRouter } from 'next/navigation';
import type { PresenceState } from '@taskin/contracts';
import { PRESENCE_OPTIONS } from '@/data/reference';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { Avatar, Button, MenuItem, MenuList, Popover, PopoverDivider } from '@/components/ui';
import { ClockIcon, LogoutIcon, MessagesIcon, ShieldIcon, UserIcon } from '@/components/icons';

interface ProfileMenuProps {
  readonly fullName: string;
  readonly initials: string;
  readonly jobTitle: string;
  readonly presence: PresenceState;
  readonly statusMessage: string;
}

export function ProfileMenu({ fullName, initials, jobTitle, presence, statusMessage }: ProfileMenuProps) {
  const { open } = useOverlays();
  const router = useRouter();
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
              <Avatar
                name={fullName}
                initials={initials}
                tone="brand"
                size="md"
                presence={presence}
                decorative
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm font-semibold text-fg-primary">{fullName}</span>
                <span className="truncate text-micro text-fg-tertiary">
                  {statusMessage ? `${presenceLabel}، ${statusMessage}` : `${jobTitle}، ${presenceLabel}`}
                </span>
              </span>
            </div>
            <PopoverDivider />
            <MenuList>
              <MenuItem
                onSelect={run(() => router.push('/support/tickets'))}
                icon={<MessagesIcon size={18} />}
              >
                درخواست‌های پشتیبانی
              </MenuItem>
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
