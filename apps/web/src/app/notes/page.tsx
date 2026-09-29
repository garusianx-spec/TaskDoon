'use client';

import { useMemo, useState } from 'react';
import type { Note, TagTone } from '@taskin/contracts';
import { DEFAULT_NOTE_CATEGORY_ID } from '@/data/reference';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterNotes, noteCategoryLabel, taskById } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { nextLocalId } from '@/store/ids';
import { cn } from '@/lib/cn';
import { formatCount, formatFraction } from '@/lib/format';
import { TAG_DOT } from '@/lib/tag-tone';
import { checklistProgress, notePreview, splitForTask, stripInline } from '@taskin/text';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { NotesSidebar } from '@/components/notes/NotesSidebar';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { Button, EmptyState, ExpandableSearch, IconButton, RelativeTime } from '@/components/ui';
import {
  AddIcon,
  ChecklistIcon,
  ConvertToTaskIcon,
  FilterIcon,
  NotebookIcon,
  PinIcon,
} from '@/components/icons';

/**
 * "دفترچه یادداشت": the notebook column (new note, categories with their own add button,
 * colour tags, the pinned shelf); the note list — searchable from its header — and the
 * editor in the workspace.
 */
export default function NotesPage() {
  const { state, dispatch } = useWorkspace();
  const { openTaskComposer } = useOverlays();
  const [categoryId, setCategoryId] = useState<string>('all');
  const [color, setColor] = useState<TagTone | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => filterNotes(state.notes, { categoryId: 'all', color: null, search: '' })[0]?.id ?? null,
  );
  // Phone width: the context column opens over the list, and the editor over both.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

  const { notes, noteCategories: categories } = state;
  const visible = useMemo(() => filterNotes(notes, { categoryId, color, search }), [notes, categoryId, color, search]);
  const selected = notes.find((note) => note.id === selectedId) ?? visible[0];

  const select = (noteId: string) => {
    setSelectedId(noteId);
    setMobileSidebarOpen(false);
    setMobileEditorOpen(true);
  };

  const changeCategory = (next: string) => {
    setCategoryId(next);
    setMobileSidebarOpen(false);
    setMobileEditorOpen(false);
  };

  const createNote = () => {
    const noteId = nextLocalId('note');
    // A new note belongs to the category being viewed; under "همه" it starts as personal while
    // that notebook exists (the server picks it in the live app), else in no notebook.
    const personal = categories.some((category) => category.id === DEFAULT_NOTE_CATEGORY_ID) ? DEFAULT_NOTE_CATEGORY_ID : null;
    dispatch({ type: 'create-note', noteId, categoryId: categoryId === 'all' ? personal : categoryId });
    // A colour or search filter would hide the blank note; clear them so it stays in view.
    setColor(null);
    setSearch('');
    select(noteId);
  };

  const convertToTask = (note: Note) => {
    const { description, subtasks } = splitForTask(note.body);
    const title = note.title.trim() || stripInline(notePreview(note.body, 70)) || 'وظیفه از یادداشت';
    openTaskComposer(taskDraft({ title, description, subtaskTitles: subtasks, sourceNoteId: note.id }));
  };

  const heading = categoryId === 'all' ? 'همه یادداشت‌ها' : noteCategoryLabel(categories, categoryId);

  return (
    <AppShell
      mobileShowsDetail={!mobileSidebarOpen}
      sidebar={
        <NotesSidebar
          notes={notes}
          categories={categories}
          categoryId={categoryId}
          color={color}
          selectedNoteId={selected?.id ?? null}
          onCategoryChange={changeCategory}
          onColorChange={setColor}
          onSelectNote={select}
          onCreateNote={createNote}
          onCreateCategory={(label) => {
            const id = nextLocalId('cat');
            dispatch({ type: 'create-note-category', categoryId: id, label });
            changeCategory(id);
          }}
          onDeleteCategory={(id) => {
            dispatch({ type: 'delete-note-category', categoryId: id });
            if (categoryId === id) setCategoryId('all');
          }}
        />
      }
    >
      <div className="flex h-full min-h-0">
        <section
          aria-label={`فهرست ${heading}`}
          className={cn(
            'min-h-0 w-full shrink-0 flex-col border-e border-secondary bg-surface lg:flex lg:w-96',
            mobileEditorOpen ? 'hidden' : 'flex',
          )}
        >
          <header className="flex flex-col gap-3 border-b border-secondary px-4 pb-3 pt-3">
            <div className="flex h-10 items-center gap-2">
              {/* The title yields its room to the search field while a search is open. */}
              <div className={cn('min-w-0 flex-1 flex-col', searchOpen ? 'hidden' : 'flex')}>
                <h1 className="truncate text-heading-sm font-bold text-fg-primary">{heading}</h1>
                <span className="numeric text-caption text-fg-tertiary">{`${formatCount(visible.length)} یادداشت`}</span>
              </div>
              <div role="toolbar" aria-label="اقدام‌های یادداشت" className={cn('flex items-center gap-1.5', searchOpen && 'flex-1')}>
                <ExpandableSearch
                  label="جستجو در یادداشت‌ها"
                  placeholder="عنوان یا متن…"
                  value={search}
                  onChange={setSearch}
                  onOpenChange={setSearchOpen}
                  fill
                  className={searchOpen ? 'flex-1' : undefined}
                />
                <IconButton
                  label="دسته‌ها و فیلترها"
                  icon={<FilterIcon size={18} />}
                  onClick={() => setMobileSidebarOpen(true)}
                  className="lg:hidden"
                />
                {/* On a phone the notebook column sits behind the filter button; creating stays one tap away. */}
                <IconButton
                  label="یادداشت جدید"
                  icon={<AddIcon size={18} />}
                  variant="primary"
                  onClick={createNote}
                  className="lg:hidden"
                />
              </div>
            </div>
          </header>

          {visible.length === 0 ? (
            <EmptyState
              compact
              icon={<NotebookIcon size={20} />}
              title="یادداشتی پیدا نشد"
              description="دسته یا فیلتر دیگری را انتخاب کنید، یا یادداشت تازه‌ای بنویسید."
              action={
                <Button size="sm" iconStart={<AddIcon size={16} />} onClick={createNote}>
                  یادداشت جدید
                </Button>
              }
            />
          ) : (
            <ul className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {visible.map((note) => (
                <NoteListItem key={note.id} note={note} active={note.id === selected?.id} onSelect={() => select(note.id)} />
              ))}
            </ul>
          )}
        </section>

        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', mobileEditorOpen ? 'flex' : 'hidden lg:flex')}>
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              categories={categories}
              linkedTask={selected.linkedTaskId ? taskById(state.tasks, selected.linkedTaskId) : undefined}
              onPatch={(patch) => dispatch({ type: 'update-note', noteId: selected.id, patch })}
              onDelete={() => {
                const next = visible.find((note) => note.id !== selected.id);
                dispatch({ type: 'delete-note', noteId: selected.id });
                setSelectedId(next?.id ?? null);
                setMobileEditorOpen(false);
              }}
              onConvertToTask={() => convertToTask(selected)}
              onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
              onBack={() => setMobileEditorOpen(false)}
            />
          ) : (
            <EmptyState
              icon={<NotebookIcon size={26} />}
              title="یادداشتی انتخاب نشده است"
              description="از فهرست یک یادداشت را باز کنید یا یادداشت تازه‌ای بسازید."
              action={
                <Button size="sm" iconStart={<AddIcon size={16} />} onClick={createNote}>
                  یادداشت جدید
                </Button>
              }
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NoteListItem({ note, active, onSelect }: { readonly note: Note; readonly active: boolean; readonly onSelect: () => void }) {
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
