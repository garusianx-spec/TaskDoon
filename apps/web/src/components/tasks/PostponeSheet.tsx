'use client';

import type { Task } from '@taskin/contracts';
import { addDays, formatJalali } from '@taskin/jalali';
import { directory } from '@/store/directory';
import { Avatar, BottomSheet } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { CalendarIcon, ClockIcon, UserAddIcon } from '@/components/icons';

export interface PostponeSheetProps {
  readonly task: Task | null;
  readonly onClose: () => void;
  readonly onPostpone: (taskId: string, dueDate: string) => void;
  readonly onReassign: (taskId: string, userId: string) => void;
}

/** Swipe-left destination: postpone by a preset, or hand the task to someone else. */
export function PostponeSheet({ task, onClose, onPostpone, onReassign }: PostponeSheetProps) {
  if (!task) return null;

  const presets = [
    { label: 'فردا', days: 1 },
    { label: 'سه روز دیگر', days: 3 },
    { label: 'هفته آینده', days: 7 },
  ] as const;

  return (
    <BottomSheet open onClose={onClose} title="تعویق یا ارجاع وظیفه" description={task.title}>
      <MenuList>
        <p className="px-2.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          تعویق مهلت
        </p>
        {presets.map((preset) => {
          const nextDate = addDays(task.dueDate, preset.days);
          return (
            <MenuItem
              key={preset.label}
              icon={<ClockIcon size={20} />}
              onSelect={() => {
                onPostpone(task.id, nextDate);
                onClose();
              }}
              className="py-3"
            >
              <span className="flex flex-col">
                <span>{preset.label}</span>
                <span className="numeric text-micro font-normal text-fg-tertiary">
                  {formatJalali(nextDate, 'medium')}
                </span>
              </span>
            </MenuItem>
          );
        })}

        <p className="px-2.5 pb-1 pt-3 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          ارجاع به همکار
        </p>
        {directory.users().filter((user) => !task.assigneeIds.includes(user.id))
          .slice(0, 5)
          .map((user) => (
            <MenuItem
              key={user.id}
              icon={
                <Avatar
                  name={user.fullName}
                  initials={user.initials}
                  tone={user.avatarTone}
                  size="sm"
                  decorative
                />
              }
              onSelect={() => {
                onReassign(task.id, user.id);
                onClose();
              }}
              className="py-3"
            >
              <span className="flex flex-col">
                <span>{user.fullName}</span>
                <span className="text-micro font-normal text-fg-tertiary">{user.jobTitle}</span>
              </span>
            </MenuItem>
          ))}

        <MenuItem icon={<CalendarIcon size={20} />} onSelect={onClose} className="py-3">
          انتخاب تاریخ دلخواه از تقویم شمسی
        </MenuItem>
        <MenuItem icon={<UserAddIcon size={20} />} onSelect={onClose} className="py-3">
          مشاهده همه اعضای سازمان
        </MenuItem>
      </MenuList>
    </BottomSheet>
  );
}
