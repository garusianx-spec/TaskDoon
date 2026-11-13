import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProfileModal } from '@/features/account/components/ProfileModal';
import { PasswordManagement } from '@/features/account/components/PasswordManagement';
import { NoteEditor } from '@/features/notes/components/NoteEditor';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { workspaceReducer } from '@/store/workspace-reducer';
import { profileNameError } from '@/features/account/lib/profile-name';
import { newNoteCategory, noteSaveError, reconcileNoteCategory } from '@/features/notes/lib/note-form';
import { ApiProblem } from '@/lib/api-client';

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement('section', null, children, footer),
}));

describe('profile and note forms', () => {
  it('asks for the current password only when a live account already has one', () => {
    const state = DEMO_WORKSPACE_STATE;
    const user = state.users.find((entry) => entry.id === state.meId)!;
    const render = (hasPassword: boolean) =>
      renderToStaticMarkup(
        createElement(PasswordManagement, {
          open: true,
          user,
          passwordChangedAt: state.passwordChangedAt,
          onPasswordChanged: () => undefined,
          live: { hasPassword, onChangePassword: async () => null },
        }),
      );

    expect(render(false)).toContain('تعیین رمز مدیر');
    expect(render(false)).not.toContain('autoComplete="current-password"');
    expect(render(true)).toContain('تغییر رمز مدیر');
    expect(render(true)).toContain('autoComplete="current-password"');
  });

  it('renders an editable, labelled account name with keyboard submission', () => {
    const state = DEMO_WORKSPACE_STATE;
    const user = state.users.find((user) => user.id === state.meId)!;
    const html = renderToStaticMarkup(
      createElement(ProfileModal, {
        open: true,
        user,
        profile: state.profile,
        onClose: () => undefined,
        onSave: async () => undefined,
        onOpenSecurity: () => undefined,
      }),
    );
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
    const html = renderToStaticMarkup(
      createElement(NoteEditor, {
        note,
        categories: state.noteCategories,
        linkedTask: undefined,
        onPatch: () => undefined,
        onSave: async () => undefined,
        onDelete: async () => undefined,
        onConvertToTask: () => undefined,
        onOpenTask: () => undefined,
        onBack: () => undefined,
      }),
    );
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
    expect(next.users.find((user) => user.id === state.meId)).toMatchObject({
      fullName: 'نسیم رحیمی',
      initials: 'نر',
    });
    expect(next.users.filter((user) => user.id !== state.meId)).toEqual(
      state.users.filter((user) => user.id !== state.meId),
    );
    expect(next.projects).toBe(state.projects);
  });

  it('resolves live UUID categories by key and keeps an explicit filter or no category', () => {
    const categories = [
      { id: 'uuid-personal', key: 'personal', label: 'شخصی', builtIn: true },
      { id: 'uuid-work', key: 'work', label: 'کاری', builtIn: true },
    ];
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
