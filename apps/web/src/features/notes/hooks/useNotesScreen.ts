'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note, TagTone } from '@taskin/contracts';
import { newNoteCategory, reconcileNoteCategory } from '@/features/notes/lib/note-form';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterNotes, noteCategoryLabel } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { nextLocalId } from '@/store/ids';
import { notePreview, splitForTask, stripInline } from '@taskin/text';
import { useOverlays } from '@/components/overlays/OverlayProvider';

/**
 * The note that took `id`'s place between two renders: the store swaps a stored draft's local id
 * for the server's in place, at the same index. `null` when `id` is still there (or simply gone).
 */
function replacementOf(before: readonly Note[], after: readonly Note[], id: string): string | null {
  if (after.some((note) => note.id === id)) return null;
  const at = before.findIndex((note) => note.id === id);
  const successor = at >= 0 ? after[at] : undefined;
  return successor && !before.some((note) => note.id === successor.id) ? successor.id : null;
}

export function useNotesScreen() {
  const { state, dispatch, saveNote } = useWorkspace();
  const { openTaskComposer } = useOverlays();
  const [categoryId, setCategoryId] = useState<string>('all');
  const [color, setColor] = useState<TagTone | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!saveNotice) return;
    const timer = setTimeout(() => setSaveNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [saveNotice]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => filterNotes(state.notes, { categoryId: 'all', color: null, search: '' })[0]?.id ?? null,
  );
  // Phone width: the context column opens over the list, and the editor over both.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

  const { notes, noteCategories: categories } = state;
  const [seenCategories, setSeenCategories] = useState({
    workspaceId: state.activeWorkspaceId,
    items: categories,
  });
  if (seenCategories.items !== categories || seenCategories.workspaceId !== state.activeWorkspaceId) {
    setSeenCategories({ workspaceId: state.activeWorkspaceId, items: categories });
    const nextFilter =
      seenCategories.workspaceId === state.activeWorkspaceId
        ? reconcileNoteCategory(seenCategories.items, categories, categoryId)
        : 'all';
    if (nextFilter !== categoryId) setCategoryId(nextFilter);
  }
  // The note «یادداشت جدید» just started: kept only once it has words in it.
  const [draftId, setDraftId] = useState<string | null>(null);
  // The editor's key per note: a draft keeps its editor (focus, caret) when it is stored.
  const [editorKeys, setEditorKeys] = useState<Readonly<Record<string, string>>>({});
  const [seenNotes, setSeenNotes] = useState(notes);
  if (seenNotes !== notes) {
    // A stored draft trades its local id for the server's; the selection follows it.
    setSeenNotes(notes);
    const stored = selectedId ? replacementOf(seenNotes, notes, selectedId) : null;
    if (selectedId && stored) {
      setSelectedId(stored);
      setEditorKeys((keys) => ({ ...keys, [stored]: keys[selectedId] ?? selectedId }));
      if (draftId === selectedId) setDraftId(stored);
    }
  }
  const visible = useMemo(
    () => filterNotes(notes, { categoryId, color, search }),
    [notes, categoryId, color, search],
  );
  const selected = notes.find((note) => note.id === selectedId) ?? visible[0];
  const editorIdentity = selected ? (editorKeys[selected.id] ?? selected.id) : null;
  const currentEditor = useRef({ workspaceId: state.activeWorkspaceId, identity: editorIdentity });
  currentEditor.current = { workspaceId: state.activeWorkspaceId, identity: editorIdentity };

  /** Leaving a new note that is still blank: it goes, and nothing was ever saved of it. */
  const discardBlankDraft = (keep?: string) => {
    if (!draftId || draftId === keep) return;
    const draft = notes.find((note) => note.id === draftId);
    if (draft && !draft.title.trim() && !draft.body.trim())
      dispatch({ type: 'discard-note', noteId: draftId });
    setDraftId(null);
  };
  // Leaving the notebook altogether counts too.
  const leave = useRef(discardBlankDraft);
  useEffect(() => {
    leave.current = discardBlankDraft;
  });
  useEffect(() => () => leave.current(), []);

  const open = (noteId: string) => {
    setSelectedId(noteId);
    setMobileSidebarOpen(false);
    setMobileEditorOpen(true);
  };

  const select = (noteId: string) => {
    discardBlankDraft(noteId);
    open(noteId);
  };

  const changeCategory = (next: string) => {
    discardBlankDraft();
    setCategoryId(next);
    setMobileSidebarOpen(false);
    setMobileEditorOpen(false);
  };

  const startNote = (notebookId: string | null) => {
    discardBlankDraft();
    const noteId = nextLocalId('note');
    dispatch({ type: 'create-note', noteId, categoryId: notebookId });
    // A colour or search filter would hide the blank note; clear them so it stays in view.
    setColor(null);
    setSearch('');
    open(noteId);
    setDraftId(noteId);
  };
  const createNote = () => startNote(newNoteCategory(categories, categoryId));

  const convertToTask = (note: Note) => {
    const { description, subtasks } = splitForTask(note.body);
    const title = note.title.trim() || stripInline(notePreview(note.body, 70)) || 'وظیفه از یادداشت';
    openTaskComposer(taskDraft({ title, description, subtaskTitles: subtasks, sourceNoteId: note.id }));
  };

  const heading = categoryId === 'all' ? 'همه یادداشت‌ها' : noteCategoryLabel(categories, categoryId);

  return {
    state,
    dispatch,
    saveNote,
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
  };
}
