'use client';

import { cn } from '@/lib/utils';
import {
CalendarIcon,FlagIcon,
MilestoneIcon,
NotificationIcon
} from '@/components/icons';


export function Legend() {
  const entries = [
    { label: 'مهلت وظیفه', Icon: FlagIcon, tone: 'bg-sunken text-fg-secondary' },
    { label: 'جلسه', Icon: CalendarIcon, tone: 'bg-brand-subtle text-fg-brand' },
    { label: 'یادآور', Icon: NotificationIcon, tone: 'bg-status-progress-subtle text-status-progress' },
    { label: 'نقطه عطف', Icon: MilestoneIcon, tone: 'bg-status-done-subtle text-status-done' },
  ] as const;
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="راهنمای رنگ‌ها">
      {entries.map(({ label, Icon, tone }) => (
        <li key={label} className="flex items-center gap-1.5 text-caption text-fg-tertiary">
          <span className={cn('flex size-5 items-center justify-center rounded-md', tone)} aria-hidden="true">
            <Icon size={12} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
