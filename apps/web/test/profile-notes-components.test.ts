import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProfileModal } from '../src/components/account/ProfileModal';
import { NoteEditor } from '../src/components/notes/NoteEditor';
import { DEMO_WORKSPACE_STATE } from '../src/store/initial-state';
import { workspaceReducer } from '../src/store/workspace-reducer';
import { profileNameError } from '../src/lib/profile-name';
import { newNoteCategory, noteSaveError, reconcileNoteCategory } from '../src/lib/note-form';
import { ApiProblem } from '../src/api/http';

vi.mock('../src/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => createElement('section', null, children, footer),
}));

describe('profile and note forms', () => {
  it('renders an editable, labelled account name with keyboard submission', () => {
    const state = DEMO_WORKSPACE_STATE;
    const user = state.users.find(user => user.id === state.meId)!;
    const html = renderToStaticMarkup(createElement(ProfileModal, {
      open: true, user, profile: state.profile, onClose: () => undefined,
      onSave: async () => undefined, onOpenSecurity: () => undefined,
    }));
    expect(html).toContain('نام نمایشی');
    expect(html).toContain('name="fullName"');
    expect(html).toContain('autoComplete="name"');
    expect(html).toContain('form="profile-settings-form"');
    expect(html).not.toContain('readOnly');
    expect(html).not.toContain('فقط مدیر سیستم');
  });

  it('exposes the category picker and explicit save inside a blank editor', () => {
    const state = DEMO_WORKSPACE_STATE;
    const note = { ...state.notes[0]!, title: '', body: '' };
    const html = renderToStaticMarkup(createElement(NoteEditor, {
      note, categories: state.noteCategories, linkedTask: undefined, onPatch: () => undefined,
      onSave: async () => undefined, onDelete: () => undefined, onConvertToTask: () => undefined,
      onOpenTask: () => undefined, onBack: () => undefined,
    }));
    expect(html).toContain('ذخیره یادداشت');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('>دسته</span>');
    expect(html).toContain('عنوان یادداشت');
    expect(html).toContain('<fieldset');
  });

  it('normalizes name boundaries without rejecting Persian or astral characters', () => {
    expect(profileNameError('  نسیم رحیمی  ')).toBeUndefined();
    expect(profileNameError('😀'.repeat(80))).toBeUndefined();
    expect(profileNameError('  ')).toBeDefined();
    expect(profileNameError(' ن ')).toBeDefined();
    expect(profileNameError('ن'.repeat(81))).toBeDefined();
  });

  it('updates only the signed-in member and recomputes avatar initials', () => {
    const state = DEMO_WORKSPACE_STATE;
    const next = workspaceReducer(state, { type: 'update-display-name', fullName: '  نسیم رحیمی  ' });
    expect(next.users.find(user => user.id === state.meId)).toMatchObject({ fullName: 'نسیم رحیمی', initials: 'نر' });
    expect(next.users.filter(user => user.id !== state.meId)).toEqual(state.users.filter(user => user.id !== state.meId));
    expect(next.projects).toBe(state.projects);
  });

  it('resolves live UUID categories by key and keeps an explicit filter or no category', () => {
    const categories = [{ id: 'uuid-personal', key: 'personal', label: 'شخصی', builtIn: true }, { id: 'uuid-work', key: 'work', label: 'کاری', builtIn: true }];
    expect(newNoteCategory(categories, 'all')).toBe('uuid-personal');
    expect(newNoteCategory(categories, 'uuid-work')).toBe('uuid-work');
    expect(newNoteCategory(categories, 'deleted-category')).toBeNull();
    expect(newNoteCategory(categories.slice(1), 'all')).toBeNull();
    const message = noteSaveError(new ApiProblem(412, 'PRECONDITION_FAILED', 'stale', null));
    expect(message).toContain('متن فعلی حفظ شد');
    expect(message).not.toContain('بارگذاری شد');
  });

  it('follows a new custom notebook into its server ID and safely releases deleted filters', () => {
    const local = { id: 'cat-local-1', label: 'دفتر تیم', builtIn: false };
    const saved = { ...local, id: 'uuid-notebook' };
    expect(reconcileNoteCategory([local], [saved], local.id)).toBe(saved.id);
    expect(newNoteCategory([saved], reconcileNoteCategory([local], [saved], local.id))).toBe(saved.id);
    expect(reconcileNoteCategory([saved], [], saved.id)).toBe('all');
    expect(reconcileNoteCategory([saved], [saved], saved.id)).toBe(saved.id);
    expect(reconcileNoteCategory([local], [saved], 'all')).toBe('all');
  });
});
