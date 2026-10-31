import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeUser, Note, NoteView, ProfileSettings } from '@taskin/contracts';
import { api } from '../src/api/endpoints';
import { ApiProblem } from '../src/api/http';
import { LIVE_EMPTY_STATE } from '../src/store/initial-state';
import { LiveStore } from '../src/store/live/live-store';
import { meToUser } from '../src/api/mappers';
import { workspaceReducer, type WorkspaceAction, type WorkspaceState } from '../src/store/workspace-reducer';

const workspaceId = '01900000-0000-7000-8000-000000000041';
const noteId = '01900000-0000-7000-8000-000000000042';
const personal = '01900000-0000-7000-8000-000000000043';
const ideas = '01900000-0000-7000-8000-000000000044';
const local = 'note-local-draft';
const account: MeUser = { id: 'owner', fullName: 'نام پیشین', email: null, phone: '+989121234567', avatarTone: 'brand', locale: 'fa', timeZone: 'Asia/Tehran', hasPassword: true };
const saved: NoteView = { id: noteId, categoryId: personal, title: 'یادداشت', body: '', colors: [], pinned: false, linkedTaskId: null, version: 1, createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z' };
const profile: ProfileSettings = { presence: 'online', statusMessage: '' };

function fixture(notes: readonly Note[] = []) {
  let state: WorkspaceState = { ...LIVE_EMPTY_STATE, meId: account.id, activeWorkspaceId: workspaceId, users: [meToUser(account)], notes, profile };
  const store = new LiveStore();
  Object.assign(store, { workspaceId, status: { ...store.current, user: account, phase: 'ready' }, noteVersions: new Map([[noteId, 1]]) });
  store.attach(() => state, action => { state = workspaceReducer(state, action); });
  const dispatch = (action: WorkspaceAction) => {
    const prev = state;
    state = workspaceReducer(state, action);
    store.effect(action, prev, state);
  };
  return { store, dispatch, state: () => state };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('confirmed profile edits', () => {
  it('updates the shared name, initials and account status after the server confirms', async () => {
    const update = vi.spyOn(api.me, 'update').mockResolvedValue({ ...account, fullName: 'نسیم رحیمی' });
    const presence = vi.spyOn(api.workspaces, 'setPresence').mockResolvedValue(undefined);
    const test = fixture();
    await test.store.saveProfile('نسیم رحیمی', { presence: 'busy', statusMessage: 'تمرکز' });
    expect(update).toHaveBeenCalledWith({ fullName: 'نسیم رحیمی' });
    expect(test.state().users[0]).toMatchObject({ fullName: 'نسیم رحیمی', initials: 'نر' });
    expect(test.store.current.user?.fullName).toBe('نسیم رحیمی');
    expect(presence).toHaveBeenCalledWith(workspaceId, 'busy', 'تمرکز');
    expect(test.state().profile.presence).toBe('busy');
  });

  it('preserves the confirmed directory if a name update fails', async () => {
    vi.spyOn(api.me, 'update').mockRejectedValue(new ApiProblem(0, 'NETWORK', 'offline', null));
    const presence = vi.spyOn(api.workspaces, 'setPresence');
    const test = fixture();
    await expect(test.store.saveProfile('نسیم رحیمی', profile)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(test.state().users[0]?.fullName).toBe(account.fullName);
    expect(presence).not.toHaveBeenCalled();
  });

  it('does not repeat an already confirmed name write when retrying a failed presence update', async () => {
    const update = vi.spyOn(api.me, 'update').mockResolvedValue({ ...account, fullName: 'نسیم رحیمی' });
    vi.spyOn(api.workspaces, 'setPresence').mockRejectedValueOnce(new ApiProblem(0, 'NETWORK', 'offline', null)).mockResolvedValue(undefined);
    const test = fixture();
    const next: ProfileSettings = { presence: 'busy', statusMessage: '' };
    await expect(test.store.saveProfile('نسیم رحیمی', next)).rejects.toMatchObject({ code: 'NETWORK' });
    await test.store.saveProfile('نسیم رحیمی', next);
    expect(update).toHaveBeenCalledTimes(1);
    expect(test.state().profile).toEqual(next);
  });
});

describe('note save confirmation', () => {
  it('does not issue a redundant update when creation already stored every field', async () => {
    vi.spyOn(api.notes, 'create').mockResolvedValue({ ...saved, colors: [] });
    const update = vi.spyOn(api.notes, 'update');
    const test = fixture();
    test.dispatch({ type: 'create-note', noteId: local, categoryId: personal });
    test.dispatch({ type: 'update-note', noteId: local, patch: { title: saved.title } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).not.toHaveBeenCalled();
  });
  it('retains a category chosen while the initial create is in flight', async () => {
    let finish!: (note: NoteView) => void;
    vi.spyOn(api.notes, 'create').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const test = fixture();
    test.dispatch({ type: 'create-note', noteId: local, categoryId: personal });
    test.dispatch({ type: 'update-note', noteId: local, patch: { title: saved.title } });
    await vi.advanceTimersByTimeAsync(0);
    test.dispatch({ type: 'update-note', noteId: local, patch: { categoryId: ideas } });
    finish(saved);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.state().notes[0]?.categoryId).toBe(ideas);
  });

  it('sends an explicit null notebook instead of silently selecting Personal', async () => {
    const create = vi.spyOn(api.notes, 'create').mockResolvedValue({ ...saved, categoryId: null });
    const update = vi.spyOn(api.notes, 'update').mockResolvedValue({ ...saved, categoryId: null, version: 2 });
    const test = fixture();
    test.dispatch({ type: 'create-note', noteId: local, categoryId: null });
    test.dispatch({ type: 'update-note', noteId: local, patch: { title: saved.title } });
    await test.store.flushNote(local);
    expect(create).toHaveBeenCalledWith(workspaceId, expect.objectContaining({ categoryId: null }), expect.any(String));
    expect(update).toHaveBeenCalledWith(workspaceId, noteId, 1, expect.objectContaining({ categoryId: null }));
  });

  it('flushes a pending autosave immediately and serializes subsequent writes with the returned version', async () => {
    let finish!: (note: NoteView) => void;
    const update = vi.spyOn(api.notes, 'update').mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ...saved, version: 3 });
    const test = fixture([saved]);
    test.dispatch({ type: 'update-note', noteId, patch: { body: 'نسخه دو' } });
    const first = test.store.flushNote(noteId);
    await vi.advanceTimersByTimeAsync(0);
    test.dispatch({ type: 'update-note', noteId, patch: { body: 'نسخه سه', categoryId: ideas } });
    const second = test.store.flushNote(noteId);
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledTimes(1);
    finish({ ...saved, version: 2 });
    await Promise.all([first, second]);
    expect(update.mock.calls.map(call => call[2])).toEqual([1, 2]);
    expect(update.mock.calls[1]?.[3]).toMatchObject({ body: 'نسخه سه', categoryId: ideas });
  });

  it('keeps unsaved text on failure and allows an explicit retry', async () => {
    const update = vi.spyOn(api.notes, 'update').mockRejectedValueOnce(new ApiProblem(0, 'NETWORK', 'offline', null)).mockResolvedValue({ ...saved, version: 2 });
    const test = fixture([{ ...saved, body: 'متن حفظ‌شده' }]);
    await expect(test.store.flushNote(noteId)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(test.state().notes[0]?.body).toBe('متن حفظ‌شده');
    await test.store.flushNote(noteId);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not write into a different workspace after a pending create returns', async () => {
    let finish!: (note: NoteView) => void;
    vi.spyOn(api.notes, 'create').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const update = vi.spyOn(api.notes, 'update');
    const test = fixture();
    test.dispatch({ type: 'create-note', noteId: local, categoryId: personal });
    test.dispatch({ type: 'update-note', noteId: local, patch: { title: saved.title } });
    const flushing = test.store.flushNote(local);
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(test.store, { workspaceId: 'other-workspace' });
    finish(saved);
    await expect(flushing).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
    expect(test.state().notes.some(note => note.id === noteId)).toBe(false);
  });

  it('replays the same creation command after a lost response and then saves newer edits', async () => {
    const create = vi.spyOn(api.notes, 'create').mockRejectedValueOnce(new ApiProblem(0, 'NETWORK', 'lost response', null)).mockResolvedValue(saved);
    const update = vi.spyOn(api.notes, 'update').mockResolvedValue({ ...saved, body: 'متن تازه', version: 2 });
    const test = fixture();
    test.dispatch({ type: 'create-note', noteId: local, categoryId: personal });
    test.dispatch({ type: 'update-note', noteId: local, patch: { title: saved.title } });
    await vi.advanceTimersByTimeAsync(0);
    test.dispatch({ type: 'update-note', noteId: local, patch: { body: 'متن تازه', categoryId: ideas } });
    await test.store.flushNote(local);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(update).toHaveBeenCalledWith(workspaceId, noteId, 1, expect.objectContaining({ body: 'متن تازه', categoryId: ideas }));
  });

  it('surfaces a stale server version without erasing local text or claiming success', async () => {
    vi.spyOn(api.notes, 'update').mockRejectedValue(new ApiProblem(412, 'PRECONDITION_FAILED', 'stale note', null));
    const test = fixture([{ ...saved, body: 'تغییر محلی' }]);
    await expect(test.store.flushNote(noteId)).rejects.toMatchObject({ status: 412 });
    expect(test.state().notes[0]?.body).toBe('تغییر محلی');
  });
});
