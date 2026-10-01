'use client';

import type { Project, User } from '@/types';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { USERS } from '@/data/workspace';
import { Avatar, Badge, Button, Popover, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { CloseIcon, MessagesIcon, UserAddIcon } from '@/components/icons';

export interface ProjectMembersBarProps {
  readonly project: Project;
  readonly members: readonly User[];
  /** Currently filtered assignee, or null when the board shows everyone. */
  readonly activeAssigneeId: string | null;
  readonly onFilterByAssignee: (userId: string | null) => void;
  readonly onAddMember: (userId: string) => void;
  /** Present once the project has a linked chat channel. */
  readonly onOpenProjectChat: (() => void) | null;
  readonly className?: string;
}

/**
 * Project members in the board header.
 *
 * The avatars are filter toggles, not decoration: clicking one narrows the board to that
 * member's cards and clicking it again clears the filter. They render as a row of pressable
 * avatars rather than an overlapping stack, because an overlapped avatar is a poor click
 * target and cannot show a pressed state clearly.
 */
export function ProjectMembersBar({
  project,
  members,
  activeAssigneeId,
  onFilterByAssignee,
  onAddMember,
  onOpenProjectChat,
  className,
}: ProjectMembersBarProps) {
  const candidates = USERS.filter((user) => !project.memberIds.includes(user.id));

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <ul
        className="flex flex-row-reverse items-center"
        aria-label={`اعضای پروژه ${project.name} — برای فیلتر کردن بورد انتخاب کنید`}
      >
        {members.map((member, index) => {
          const active = activeAssigneeId === member.id;
          return (
            <li key={member.id} className={cn(index > 0 && '-ms-1.5')}>
              <Tooltip content={active ? `حذف فیلتر ${member.fullName}` : `فیلتر بر اساس ${member.fullName}`}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterByAssignee(active ? null : member.id)}
                  className={cn(
                    'rounded-full ring-2 transition-all',
                    active
                      ? 'z-10 ring-brand-600 ring-offset-1 ring-offset-surface'
                      : 'ring-surface hover:z-10 hover:ring-brand-300',
                  )}
                >
                  <Avatar
                    name={member.fullName}
                    initials={member.initials}
                    tone={member.avatarTone}
                    size="sm"
                    decorative
                  />
                  <span className="sr-only">{member.fullName}</span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <Popover
        label="افزودن عضو به پروژه"
        haspopup="menu"
        align="end"
        panelClassName="min-w-60 max-h-72 overflow-y-auto scrollbar-thin"
        trigger={
          <Tooltip content="افزودن عضو / دعوت">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full border border-dashed border-primary text-fg-tertiary transition-colors hover:border-brand hover:bg-brand-subtle hover:text-fg-brand"
            >
              <UserAddIcon size={16} />
              <span className="sr-only">افزودن عضو به پروژه</span>
            </button>
          </Tooltip>
        }
      >
        {(close) => (
          <MenuList>
            <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
              دعوت به پروژه
            </p>
            {candidates.length === 0 ? (
              <p className="px-2.5 py-3 text-caption text-fg-tertiary">
                همه اعضای سازمان در این پروژه عضو هستند.
              </p>
            ) : (
              candidates.map((user) => (
                <MenuItem
                  key={user.id}
                  onSelect={() => {
                    onAddMember(user.id);
                    close();
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
                    <span className="truncate text-micro font-normal text-fg-tertiary">
                      {user.jobTitle}
                    </span>
                  </span>
                </MenuItem>
              ))
            )}
          </MenuList>
        )}
      </Popover>

      {activeAssigneeId && (
        <Badge tone="brand" size="md" numeric>
          <button
            type="button"
            onClick={() => onFilterByAssignee(null)}
            className="inline-flex items-center gap-1"
          >
            {`فیلتر: ${members.find((m) => m.id === activeAssigneeId)?.fullName ?? ''}`}
            <CloseIcon size={11} />
            <span className="sr-only">حذف فیلتر مسئول</span>
          </button>
        </Badge>
      )}

      {onOpenProjectChat && (
        <Button
          size="sm"
          variant="secondary"
          iconStart={<MessagesIcon size={15} />}
          onClick={onOpenProjectChat}
        >
          ورود به گفتگوی پروژه
        </Button>
      )}

      <span className="numeric text-micro text-fg-quaternary">
        {`${formatCount(members.length)} عضو`}
      </span>
    </div>
  );
}
