'use client';

import type { Note } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatCount,formatFraction } from '@/lib/format';
import { TAG_DOT } from '@/lib/tag-tone';
import { checklistProgress,notePreview } from '@taskin/text';
import { RelativeTime } from '@/components/ui';
import {
ChecklistIcon,
ConvertToTaskIcon,PinIcon
} from '@/components/icons';


export function NoteListItem({ note, active, onSelect }: { readonly note: Note; readonly active: boolean; readonly onSelect: () => void }) {
  const progress = checklistProgress(note.body);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-start transition-colors',
          active ? 'border-brand bg-brand-subtle' : 'border-transparent hover:bg-hover',
        )}
      >
        <span className="flex items-center gap-1.5">
          {note.pinned && <PinIcon size={14} className="shrink-0 text-fg-brand" label="سنجاق‌شده" />}
          <span className={cn('truncate text-body-sm font-semibold', note.title ? 'text-fg-primary' : 'text-fg-tertiary')}>
            {note.title || 'بدون عنوان'}
          </span>
          {note.linkedTaskId && (
            <ConvertToTaskIcon size={14} className="ms-auto shrink-0 text-fg-quaternary" label="تبدیل‌شده به وظیفه" />
          )}
        </span>
        <span className="line-clamp-2 text-caption text-fg-tertiary">{notePreview(note.body) || 'بدون متن'}</span>
        <span className="flex items-center gap-2 text-micro text-fg-quaternary">
          <RelativeTime iso={note.updatedAt} className="numeric" />
          {progress.total > 0 && (
            <span className="numeric inline-flex items-center gap-1">
              <ChecklistIcon size={12} />
              {formatFraction(progress.done, progress.total)}
            </span>
          )}
          {note.colors.length > 0 && (
            <span className="ms-auto flex items-center gap-1" aria-label={`${formatCount(note.colors.length)} برچسب رنگی`}>
              {note.colors.map((tone) => (
                <span key={tone} className={cn('size-2 rounded-full', TAG_DOT[tone])} aria-hidden="true" />
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
