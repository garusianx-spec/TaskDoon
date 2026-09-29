'use client';

import { useRef, useState } from 'react';
import type { Note, NoteCategory, NotePatch, Task } from '@taskin/contracts';
import { TAG_TONES } from '@/data/reference';
import { noteCategoryLabel } from '@/store/selectors';
import { cn } from '@/lib/cn';
import { formatFraction } from '@/lib/format';
import { TAG_DOT } from '@/lib/tag-tone';
import { checklistProgress, toggleChecklistLine } from '@taskin/text';
import { useNamespacedId } from '@/hooks/useId';
import {
  Button,
  IconButton,
  Popover,
  ProgressBar,
  RelativeTime,
  SegmentedControl,
  Select,
  Tooltip,
} from '@/components/ui';
import {
  ArrowBackwardIcon,
  BoldIcon,
  ChecklistIcon,
  ConvertToTaskIcon,
  EditIcon,
  EyeIcon,
  HeadingIcon,
  ItalicIcon,
  ListIcon,
  PinIcon,
  TaskSquareIcon,
  TrashIcon,
} from '@/components/icons';
import { NoteMarkdown } from './NoteMarkdown';
import { NoteBlockEditor, type NoteBlockEditorHandle } from './NoteBlockEditor';

/** The category picker's value for «بدون دسته» (a note whose notebook was deleted). */
const NO_NOTEBOOK = 'none';

export interface NoteEditorProps {
  readonly note: Note;
  readonly categories: readonly NoteCategory[];
  readonly linkedTask: Task | undefined;
  readonly onPatch: (patch: NotePatch) => void;
  readonly onDelete: () => void;
  readonly onConvertToTask: () => void;
  readonly onOpenTask: (taskId: string) => void;
  /** Phone width only: back to the list. */
  readonly onBack: () => void;
}

type Mode = 'edit' | 'preview';

/**
 * Note editor. "ویرایش" edits text as Markdown and checklists as real checkboxes (see
 * `NoteBlockEditor`); "پیش‌نمایش" renders headings and emphasis with the same live boxes.
 * Every keystroke is saved to workspace state, so there is no save button to forget.
 */
export function NoteEditor({ note, categories, linkedTask, onPatch, onDelete, onConvertToTask, onOpenTask, onBack }: NoteEditorProps) {
  const [mode, setMode] = useState<Mode>(() => (note.body.trim() ? 'preview' : 'edit'));
  const blocksRef = useRef<NoteBlockEditorHandle | null>(null);
  const id = useNamespacedId('note-');
  const progress = checklistProgress(note.body);
  const isBlank = !note.title && !note.body;

  return (
    <article aria-labelledby={`${id}-title-label`} className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-secondary px-3 py-2.5 sm:px-4">
        <IconButton
          label="بازگشت به فهرست یادداشت‌ها"
          icon={<ArrowBackwardIcon size={18} />}
          size="sm"
          onClick={onBack}
          className="lg:hidden"
        />
        {/* `Select` fills its container, so the container sets the width. */}
        <div className="w-40 shrink-0">
          <Select
            label="دسته"
            size="sm"
            value={note.categoryId ?? NO_NOTEBOOK}
            onValueChange={(categoryId) => onPatch({ categoryId: categoryId === NO_NOTEBOOK ? null : categoryId })}
            options={[
              ...categories.map((category) => ({ value: category.id, label: category.label })),
              { value: NO_NOTEBOOK, label: 'بدون دسته' },
            ]}
          />
        </div>
        <Tooltip content={note.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}>
          <IconButton
            label={note.pinned ? 'برداشتن سنجاق یادداشت' : 'سنجاق کردن یادداشت'}
            icon={<PinIcon size={18} />}
            size="sm"
            aria-pressed={note.pinned}
            active={note.pinned}
            onClick={() => onPatch({ pinned: !note.pinned })}
          />
        </Tooltip>

        <div role="group" aria-label="برچسب‌های رنگی یادداشت" className="flex items-center gap-1 px-1">
          {TAG_TONES.map((entry) => {
            const on = note.colors.includes(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={on}
                aria-label={`برچسب ${entry.label}`}
                title={entry.label}
                onClick={() =>
                  onPatch({
                    colors: on ? note.colors.filter((tone) => tone !== entry.id) : [...note.colors, entry.id],
                  })
                }
                className={cn(
                  'size-5 rounded-full ring-offset-2 ring-offset-surface transition-[box-shadow,opacity]',
                  TAG_DOT[entry.id],
                  on ? 'ring-2 ring-brand' : 'opacity-40 hover:opacity-100',
                )}
              />
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          <Popover
            label="تایید حذف یادداشت"
            panelClassName="w-64 p-3"
            trigger={<IconButton label="حذف یادداشت" icon={<TrashIcon size={18} />} size="sm" className="hover:text-status-blocked" />}
          >
            {(close) => (
              <div className="flex flex-col gap-3">
                <p className="text-body-sm text-fg-secondary">این یادداشت حذف شود؟ این کار بازگشت‌پذیر نیست.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    fullWidth
                    onClick={() => {
                      close();
                      onDelete();
                    }}
                  >
                    حذف
                  </Button>
                  <Button size="sm" variant="secondary" fullWidth onClick={close}>
                    انصراف
                  </Button>
                </div>
              </div>
            )}
          </Popover>
          {linkedTask ? (
            <Button
              size="sm"
              variant="secondary"
              iconStart={<TaskSquareIcon size={16} />}
              onClick={() => onOpenTask(linkedTask.id)}
            >
              <span className="latin-inline">{linkedTask.code}</span>
            </Button>
          ) : null}
          <Button
            size="sm"
            iconStart={<ConvertToTaskIcon size={16} />}
            aria-haspopup="dialog"
            onClick={onConvertToTask}
          >
            تبدیل یادداشت به وظیفه
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 sm:px-8">
          <label id={`${id}-title-label`} htmlFor={`${id}-title`} className="sr-only">
            عنوان یادداشت
          </label>
          <input
            id={`${id}-title`}
            value={note.title}
            onChange={(event) => onPatch({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setMode('edit');
                requestAnimationFrame(() => blocksRef.current?.focus());
              }
            }}
            placeholder="عنوان یادداشت"
            maxLength={120}
            autoFocus={isBlank}
            className="w-full rounded-md bg-transparent text-heading font-bold text-fg-primary outline-none placeholder:text-fg-placeholder focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-fg-tertiary">
            <span>{noteCategoryLabel(categories, note.categoryId)}</span>
            <span aria-hidden="true">،</span>
            <span className="numeric">
              {'آخرین ویرایش '}
              <RelativeTime iso={note.updatedAt} />
            </span>
            {progress.total > 0 && (
              <span className="flex w-40 items-center gap-2">
                <ProgressBar
                  value={progress.done}
                  max={progress.total}
                  label="پیشرفت چک‌لیست یادداشت"
                  tone={progress.done === progress.total ? 'done' : 'brand'}
                  showFraction={false}
                />
                <span className="numeric shrink-0">{formatFraction(progress.done, progress.total)}</span>
              </span>
            )}
          </div>

          {linkedTask && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-secondary bg-sunken px-3 py-2 text-caption text-fg-secondary">
              <ConvertToTaskIcon size={16} className="text-fg-brand" />
              {'این یادداشت به وظیفه '}
              <button
                type="button"
                onClick={() => onOpenTask(linkedTask.id)}
                className="font-semibold text-fg-brand underline-offset-4 hover:underline"
              >
                {`«${linkedTask.title}»`}
              </button>
              {' تبدیل شده است.'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              ariaLabel="حالت ویرایشگر"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'edit', label: 'ویرایش', icon: <EditIcon size={14} /> },
                { value: 'preview', label: 'پیش‌نمایش', icon: <EyeIcon size={14} /> },
              ]}
            />
            {mode === 'edit' && (
              <div role="toolbar" aria-label="قالب‌بندی متن" className="flex items-center gap-0.5">
                {/* `onMouseDown` keeps focus (and the caret) in the note while a button is pressed. */}
                <IconButton label="تیتر" icon={<HeadingIcon size={16} />} size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => blocksRef.current?.prefixLines('## ')} />
                <IconButton label="پررنگ (Ctrl+B)" icon={<BoldIcon size={16} />} size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => blocksRef.current?.wrap('**', 'متن پررنگ')} />
                <IconButton label="مورب (Ctrl+I)" icon={<ItalicIcon size={16} />} size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => blocksRef.current?.wrap('*', 'متن مورب')} />
                <IconButton label="فهرست نشانه‌دار" icon={<ListIcon size={16} />} size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => blocksRef.current?.prefixLines('- ')} />
                <IconButton label="چک‌لیست" icon={<ChecklistIcon size={16} />} size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => blocksRef.current?.insertChecklistItem()} />
              </div>
            )}
          </div>

          {mode === 'edit' ? (
            <NoteBlockEditor ref={blocksRef} initialBody={note.body} onChange={(body) => onPatch({ body })} />
          ) : note.body.trim() ? (
            <NoteMarkdown
              source={note.body}
              onToggleLine={(line) => onPatch({ body: toggleChecklistLine(note.body, line) })}
            />
          ) : (
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="rounded-lg border border-dashed border-primary px-4 py-8 text-body-sm text-fg-tertiary transition-colors hover:border-brand hover:text-fg-brand"
            >
              این یادداشت هنوز متنی ندارد. برای نوشتن کلیک کنید.
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
