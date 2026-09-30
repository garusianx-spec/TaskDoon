'use client';

import { useOverlays } from '@/components/overlays/OverlayProvider';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { CalendarIcon, FolderAddIcon, MessagesIcon, TaskSquareIcon, UserAddIcon } from '@/components/icons';

/**
 * Body of the (+) quick-create popover, shared by the desktop rail and the mobile top bar.
 * `close` dismisses the popover (returning focus to its trigger) before the dialog opens,
 * so the dialog records the trigger as the element to restore focus to.
 */
export function QuickCreateMenu({ close }: { readonly close: () => void }) {
  const { open, openTaskComposer } = useOverlays();
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <MenuList>
      <MenuItem onSelect={run(() => openTaskComposer(null))} icon={<TaskSquareIcon size={18} />} shortcut="N">
        وظیفه جدید
      </MenuItem>
      <MenuItem
        onSelect={run(() => open({ kind: 'conversation-composer' }))}
        icon={<MessagesIcon size={18} />}
        shortcut="M"
      >
        گفتگوی جدید
      </MenuItem>
      <MenuItem onSelect={run(() => open({ kind: 'event-composer', date: null }))} icon={<CalendarIcon size={18} />}>
        رویداد تقویم
      </MenuItem>
      <MenuItem onSelect={run(() => open({ kind: 'invite-member' }))} icon={<UserAddIcon size={18} />}>
        دعوت همکار
      </MenuItem>
      <MenuItem onSelect={run(() => open({ kind: 'project-composer' }))} icon={<FolderAddIcon size={18} />}>
        پروژه جدید
      </MenuItem>
    </MenuList>
  );
}
