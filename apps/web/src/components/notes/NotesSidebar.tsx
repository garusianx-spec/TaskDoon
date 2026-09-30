'use client';

import { useState, type FormEvent } from 'react';
import type { Note, NoteCategory, TagTone } from '@taskin/contracts';
import { TAG_TONES } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { TAG_DOT } from '@/lib/tag-tone';
import { notePreview } from '@taskin/text';
import { Button, Input, Modal, Popover, Tooltip } from '@/components/ui';
import {
  AddIcon,
  BriefcaseIcon,
  CalendarIcon,
  FolderAddIcon,
  FolderIcon,
  NotebookIcon,
  PinIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from '@/components/icons';

/** Glyphs for the built-in categories; a team's own categories use a folder. */
const CATEGORY_ICONS: Readonly<Record<string, typeof NotebookIcon>> = {
  all: NotebookIcon,
  personal: UserIcon,
  work: BriefcaseIcon,
  ideas: StarIcon,
  meetings: CalendarIcon,
};

export const categoryIcon = (id: string): typeof NotebookIcon => CATEGORY_ICONS[id] ?? FolderIcon;

export interface NotesSidebarProps {
  readonly notes: readonly Note[];
  readonly categories: readonly NoteCategory[];
  /** Active category id, or `'all'`. */
  readonly categoryId: string;
  readonly color: TagTone | null;
  readonly selectedNoteId: string | null;
  readonly onCategoryChange: (categoryId: string) => void;
  readonly onColorChange: (color: TagTone | null) => void;
  readonly onSelectNote: (noteId: string) => void;
  readonly onCreateNote: () => void;
  readonly onCreateCategory: (label: string) => void;
  /** Any notebook but «همه یادداشت‌ها» can be deleted (after a confirmation); its notes stay. */
  readonly onDeleteCategory: (categoryId: string) => void;
}

/**
 * Notes-context column: the notebook's own actions (a new note beside its title, a new
 * category above the list), categories, colour-tag filters and the pinned shelf. Searching
 * stays in the list header.
 */
export function NotesSidebar({
  notes,
  categories,
  categoryId,
  color,
  selectedNoteId,
  onCategoryChange,
  onColorChange,
  onSelectNote,
  onCreateNote,
  onCreateCategory,
  onDeleteCategory,
}: NotesSidebarProps) {
  const pinned = notes.filter((note) => note.pinned);
  // The notebook waiting for «آیا از حذف این دسته‌بندی اطمینان دارید؟».
  const [deleting, setDeleting] = useState<{ readonly id: string; readonly label: string } | null>(null);
  const countFor = (id: string) =>
    id === 'all' ? notes.length : notes.filter((note) => note.categoryId === id).length;

  const entries: ReadonlyArray<{ readonly id: string; readonly label: string; readonly removable: boolean }> = [
    { id: 'all', label: 'همه یادداشت‌ها', removable: false },
    ...categories.map((category) => ({
      id: category.id,
      label: category.label,
      // Built-ins too: only the «همه یادداشت‌ها» filter itself stays.
      removable: true,
    })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-secondary px-3 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-title font-bold text-fg-primary">دفترچه یادداشت</h2>
        <Button size="xs" iconStart={<AddIcon size={16} />} onClick={onCreateNote}>
          یادداشت جدید
        </Button>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        <nav aria-label="دسته‌ها" className="flex flex-col gap-0.5">
          <h3 className="px-2.5 pb-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            دسته‌ها
          </h3>
          <CreateCategoryButton categories={categories} onCreate={onCreateCategory} />
          {entries.map(({ id, label, removable }) => {
            const Icon = categoryIcon(id);
            const active = categoryId === id;
            return (
              <div key={id} className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => onCategoryChange(id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-body-sm font-medium transition-colors',
                    active ? 'bg-brand-subtle text-fg-brand' : 'text-fg-secondary hover:bg-hover',
                    // Room for the delete button that sits over the row's end.
                    removable && 'pe-10',
                  )}
                >
                  <Icon size={18} variant={active ? 'twotone' : 'linear'} />
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      'numeric rounded-full px-1.5 py-0.5 text-micro font-semibold',
                      active ? 'bg-surface text-fg-brand' : 'bg-sunken text-fg-tertiary',
                    )}
                  >
                    {formatCount(countFor(id))}
                  </span>
                </button>
                {removable && (
                  <span className="absolute end-2">
                    <Tooltip content="حذف دسته">
                      <button
                        type="button"
                        aria-label={`حذف دسته ${label}`}
                        onClick={() => setDeleting({ id, label })}
                        className="flex size-6 items-center justify-center rounded-full text-fg-quaternary transition-colors hover:bg-status-blocked-subtle hover:text-status-blocked"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </Tooltip>
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        <div className="my-3 border-t border-secondary" />

        <div className="flex flex-col gap-1.5">
          <h3 className="px-2.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            برچسب رنگی
          </h3>
          <div className="flex flex-wrap gap-1.5 px-2" role="group" aria-label="فیلتر برچسب رنگی">
            {TAG_TONES.map((entry) => {
              const active = color === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`برچسب ${entry.label}`}
                  title={entry.label}
                  onClick={() => onColorChange(active ? null : entry.id)}
                  className={cn(
                    'size-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                    TAG_DOT[entry.id],
                    active ? 'ring-2 ring-brand' : 'hover:ring-2 hover:ring-gray-300',
                  )}
                />
              );
            })}
          </div>
        </div>

        <div className="my-3 border-t border-secondary" />

        <section aria-labelledby="pinned-notes" className="flex flex-col gap-0.5">
          <h3
            id="pinned-notes"
            className="flex items-center gap-1.5 px-2.5 pb-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary"
          >
            <PinIcon size={13} />
            سنجاق‌شده‌ها
          </h3>
          {pinned.length === 0 ? (
            <p className="px-2.5 py-1 text-caption text-fg-tertiary">یادداشت سنجاق‌شده‌ای ندارید.</p>
          ) : (
            pinned.map((note) => {
              const active = note.id === selectedNoteId;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onSelectNote(note.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-start transition-colors',
                    active ? 'bg-brand-subtle' : 'hover:bg-hover',
                  )}
                >
                  <span
                    className={cn(
                      'truncate text-body-sm font-semibold',
                      active ? 'text-fg-brand' : 'text-fg-primary',
                    )}
                  >
                    {note.title || 'بدون عنوان'}
                  </span>
                  <span className="truncate text-micro text-fg-tertiary">{notePreview(note.body, 48) || '—'}</span>
                </button>
              );
            })
          )}
        </section>
      </div>

      <DeleteCategoryDialog
        category={deleting}
        noteCount={deleting ? countFor(deleting.id) : 0}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDeleteCategory(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

/**
 * Asks before a notebook goes. Nothing is deleted on the first click; and deleting a notebook
 * never deletes its notes: they stay in «همه یادداشت‌ها», filed in no notebook.
 */
function DeleteCategoryDialog({
  category,
  noteCount,
  onClose,
  onConfirm,
}: {
  readonly category: { readonly id: string; readonly label: string } | null;
  readonly noteCount: number;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      open={category !== null}
      onClose={onClose}
      size="sm"
      title="آیا از حذف این دسته‌بندی اطمینان دارید؟"
      description={
        category
          ? noteCount > 0
            ? `دسته «${category.label}» حذف می‌شود. ${formatCount(noteCount)} یادداشت آن حذف نمی‌شود و بدون دسته در «همه یادداشت‌ها» می‌ماند.`
            : `دسته «${category.label}» حذف می‌شود. این دسته یادداشتی ندارد.`
          : ''
      }
      icon={<TrashIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            حذف دسته
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-fg-secondary">
        دسته‌های پیش‌فرض هم حذف‌شدنی‌اند؛ هر وقت خواستید می‌توانید با «افزودن دسته» دوباره بسازیدشان.
      </p>
    </Modal>
  );
}

/** "+ افزودن دسته": a dashed row above the categories that opens a one-field form. */
function CreateCategoryButton({
  categories,
  onCreate,
}: {
  readonly categories: readonly NoteCategory[];
  readonly onCreate: (label: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <Popover
      label="دسته جدید"
      align="start"
      // As wide as the column, so the form never spills sideways out of it.
      className="mb-1 w-full"
      panelClassName="w-full min-w-0 p-3"
      onOpenChange={(open) => {
        if (!open) return;
        setLabel('');
        setError(undefined);
      }}
      trigger={
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-dashed border-primary px-2.5 text-start text-body-sm font-medium text-fg-tertiary transition-colors hover:border-brand hover:bg-brand-subtle/40 hover:text-fg-brand"
        >
          <AddIcon size={16} />
          افزودن دسته
        </button>
      }
    >
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            const name = label.trim();
            if (!name) return setError('نام دسته را وارد کنید.');
            if (categories.some((category) => category.label.trim() === name)) return setError('دسته‌ای با این نام وجود دارد.');
            onCreate(name);
            close();
          }}
        >
          <Input
            label="نام دسته"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setError(undefined);
            }}
            placeholder="مثلاً: پژوهش کاربر"
            error={error}
            maxLength={24}
          />
          <Button type="submit" size="sm" iconStart={<FolderAddIcon size={16} />}>
            ایجاد دسته
          </Button>
        </form>
      )}
    </Popover>
  );
}
