'use client';

import type { User } from '@taskin/contracts';
import { directory } from '@/store/directory';
import { userById } from '@/store/selectors';
import { Avatar, Popover } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { UserAddIcon } from '@/components/icons';

interface PeoplePickerProps {
  readonly selectedIds: readonly string[];
  readonly onToggle: (userId: string) => void;
  readonly label: string;
  readonly emptyLabel: string;
  readonly single?: boolean;
}

export function PeoplePicker({
  selectedIds,
  onToggle,
  label,
  emptyLabel,
  single = false,
}: PeoplePickerProps) {
  const selected = selectedIds.map((id) => userById(id)).filter((user): user is User => user !== undefined);

  return (
    <Popover
      label={label}
      haspopup="menu"
      align="start"
      className="w-full min-w-0"
      panelClassName="w-64 min-w-0 scrollbar-thin"
      constrainToViewport
      trigger={
        <button
          type="button"
          aria-label={label}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-primary bg-surface px-2.5 py-1.5 text-start shadow-xs transition-colors hover:bg-hover"
        >
          {selected.length === 0 ? (
            <span className="flex items-center gap-2 text-body-sm text-fg-placeholder">
              <UserAddIcon size={18} />
              {emptyLabel}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-0.5 pe-2 ps-0.5"
                >
                  <Avatar
                    name={user.fullName}
                    initials={user.initials}
                    tone={user.avatarTone}
                    size="xs"
                    decorative
                  />
                  <span className="text-micro font-medium text-fg-secondary">{user.fullName}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <MenuList>
          {directory.users().map((user) => (
            <MenuItem
              key={user.id}
              selected={selectedIds.includes(user.id)}
              onSelect={() => {
                onToggle(user.id);
                if (single) close();
              }}
              icon={
                <Avatar
                  name={user.fullName}
                  initials={user.initials}
                  tone={user.avatarTone}
                  size="sm"
                  decorative
                />
              }
            >
              <span className="flex flex-col">
                <span className="truncate">{user.fullName}</span>
                <span className="truncate text-micro font-normal text-fg-tertiary">{user.jobTitle}</span>
              </span>
            </MenuItem>
          ))}
        </MenuList>
      )}
    </Popover>
  );
}
