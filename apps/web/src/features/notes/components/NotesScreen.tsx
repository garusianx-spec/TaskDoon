'use client';

import { taskById } from '@/store/selectors';
import { nextLocalId } from '@/store/ids';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { SectionBackLink } from '@/components/layout/NavigationList';
import { workspaceRoutes } from '@/lib/workspace-navigation';
import { NotesSidebar } from '@/features/notes/components/NotesSidebar';
import { NoteEditor } from '@/features/notes/components/NoteEditor';
import { ExpandableSearch, IconButton } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { AddIcon, FilterIcon, NotebookIcon } from '@/components/icons';
import { NoteListItem } from '@/features/notes/components/NoteListItem';
import { useNotesScreen } from '@/features/notes/hooks/useNotesScreen';

/**
 * "دفترچه یادداشت": the notebook column (new note, categories with their own add button,
 * colour tags, the pinned shelf); the note list — searchable from its header — and the
 * editor in the workspace.
 */
export function NotesPage() {
  const {
    state,
    dispatch,
    saveNote,
    confirmOperation,
    categoryId,
    setCategoryId,
    color,
    setColor,
    search,
    setSearch,
    searchOpen,
    setSearchOpen,
    saveNotice,
    setSaveNotice,
    setSelectedId,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    mobileEditorOpen,
    setMobileEditorOpen,
    notes,
    categories,
    editorKeys,
    visible,
    selected,
    currentEditor,
    discardBlankDraft,
    select,
    changeCategory,
    startNote,
    createNote,
    convertToTask,
    heading,
  } = useNotesScreen();

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
            'min-h-0 w-full shrink-0 flex-col border-e border-secondary bg-surface lg:flex lg:w-64 xl:w-96',
            mobileEditorOpen ? 'hidden' : 'flex',
          )}
        >
          <header className="flex flex-col gap-2 border-b border-secondary px-4 py-3">
            <div className="lg:hidden">
              <SectionBackLink href={workspaceRoutes.more}>بیشتر</SectionBackLink>
            </div>
            <div className="flex h-10 items-center gap-2">
              {/* The title yields its room to the search field while a search is open. */}
              <div className={cn('min-w-0 flex-1 flex-col', searchOpen ? 'hidden' : 'flex')}>
                <h1 className="truncate text-heading-sm font-bold text-fg-primary">{heading}</h1>
                <span className="text-caption text-fg-tertiary numeric">{`${formatCount(visible.length)} یادداشت`}</span>
              </div>
              <div
                role="toolbar"
                aria-label="اقدام‌های یادداشت"
                className={cn('flex items-center gap-1.5', searchOpen && 'flex-1')}
              >
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
            />
          ) : (
            <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 scrollbar-thin">
              {visible.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  active={note.id === selected?.id}
                  onSelect={() => select(note.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', mobileEditorOpen ? 'flex' : 'hidden lg:flex')}>
          {saveNotice && (
            <p
              role="status"
              className="border-b border-secondary bg-sunken px-4 py-2 text-caption text-fg-secondary"
            >
              {saveNotice}
            </p>
          )}
          {selected ? (
            <NoteEditor
              key={editorKeys[selected.id] ?? selected.id}
              note={selected}
              categories={categories}
              linkedTask={selected.linkedTaskId ? taskById(state.tasks, selected.linkedTaskId) : undefined}
              onPatch={(patch) => dispatch({ type: 'update-note', noteId: selected.id, patch })}
              onSave={async () => {
                const origin = currentEditor.current;
                await saveNote(selected.id);
                if (
                  origin.workspaceId !== currentEditor.current.workspaceId ||
                  origin.identity !== currentEditor.current.identity
                )
                  return;
                startNote(selected.categoryId);
                setSaveNotice('یادداشت ذخیره شد. یادداشت تازه‌ای بنویسید.');
              }}
              onDelete={async () => {
                const origin = currentEditor.current;
                const next = visible.find((note) => note.id !== selected.id);
                await confirmOperation({ type: 'delete-note', noteId: selected.id });
                if (currentEditor.current.identity && currentEditor.current.identity !== origin.identity)
                  return;
                setSelectedId(next?.id ?? null);
                setMobileEditorOpen(false);
              }}
              onConvertToTask={() => convertToTask(selected)}
              onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
              onBack={() => {
                discardBlankDraft();
                setMobileEditorOpen(false);
              }}
            />
          ) : (
            <EmptyState
              icon={<NotebookIcon size={26} />}
              title="یادداشتی انتخاب نشده است"
              description="از فهرست یک یادداشت را باز کنید یا یادداشت تازه‌ای بسازید."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
