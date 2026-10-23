import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentView, TaskDetail, TaskDraft } from '@taskin/contracts';
import { api } from '../src/api/endpoints';
import { ApiProblem } from '../src/api/http';
import { taskDraft } from '../src/store/drafts';
import { LIVE_EMPTY_STATE } from '../src/store/initial-state';
import { LiveStore } from '../src/store/live/live-store';
import { workspaceReducer, type WorkspaceAction, type WorkspaceState } from '../src/store/workspace-reducer';

const taskId = '01900000-0000-7000-8000-000000000021';
const attachmentId = '01900000-0000-7000-8000-000000000022';
const uploaded: AttachmentView = { id: attachmentId, name: 'report.txt', kind: 'document', mimeType: 'text/plain', size: 6, status: 'scanning', uploadedById: 'owner', uploadedAt: '2026-10-23T00:00:00.000Z' };
const draft: TaskDraft & { readonly startDate: string } = { title: 'New task', description: '', projectId: 'project-id', status: 'todo', boardColumnId: null, priority: 'medium', assigneeIds: [], startDate: '2026-10-20', dueDate: '2026-10-28', sourceMessageId: null, sourceNoteId: null, subtaskTitles: [], attachments: [{ ...uploaded, url: null }] };
const detail: TaskDetail = { id: taskId, code: 'NEW-1', projectId: draft.projectId, title: draft.title, description: '', status: 'todo', priority: 'medium', columnId: 'column-id', position: 'a0', assigneeIds: [], reviewerId: null, startDate: draft.startDate, dueDate: draft.dueDate, labelIds: [], starred: false, subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0, attachmentCount: 1, completedAt: null, archived: false, sourceMessageId: null, sourceNoteId: null, version: 1, createdAt: uploaded.uploadedAt, updatedAt: uploaded.uploadedAt, type: 'task', severity: null, estimatedMinutes: null, spentMinutes: 0, isBacklog: false, blockedByIds: [], createdById: 'owner', reopenColumnId: null, subtasks: [], comments: [], attachments: [uploaded], timeline: [], myActions: ['view', 'edit'], sourceMessage: null };

function stateStore(initial: Partial<WorkspaceState> = {}) {
  const store = new LiveStore();
  Object.assign(store, { status: { ...store.current, phase: 'ready' }, workspaceId: 'workspace-id' });
  let state: WorkspaceState = { ...LIVE_EMPTY_STATE, meId: 'owner', ...initial };
  store.attach(() => state, action => { state = workspaceReducer(state, action); });
  const create = (nextDraft: TaskDraft = draft) => {
    const previous = state;
    const action: WorkspaceAction = { type: 'create-task', draft: nextDraft, authorId: 'owner' };
    state = workspaceReducer(state, action);
    store.effect(action, previous, state);
  };
  const createAwaited = (nextDraft: TaskDraft = draft, files: readonly File[] = [], commandId?: string) => {
    const previous = state;
    state = workspaceReducer(state, { type: 'create-task', draft: nextDraft, authorId: 'owner' });
    return store.createTask(nextDraft, previous, state, files, commandId);
  };
  return { store, create, createAwaited, state: () => state };
}

function uploads() {
  const plan = vi.spyOn(api.files, 'plan').mockResolvedValue({ attachment: uploaded, plan: { kind: 'post', url: 'https://storage.example.test/upload', fields: { key: 'object', 'Content-Type': 'text/plain' } }, expiresInSeconds: 60 });
  const complete = vi.spyOn(api.files, 'complete').mockResolvedValue(uploaded);
  const abort = vi.spyOn(api.files, 'abort').mockResolvedValue(undefined);
  const storage = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', storage);
  return { plan, complete, abort, storage };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('task form request persistence', () => {
  it('reuses a form command id after the task committed but the response was lost', async () => {
    const commandId = '01900000-0000-7000-8000-000000000029';
    const responses = new Map<string, TaskDetail>();
    const keys: string[] = [];
    let loseResponse = true;
    let created = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const key = new Headers(options?.headers).get('idempotency-key')!;
      keys.push(key);
      if (!responses.has(key)) responses.set(key, { ...detail, code: `NEW-${++created}` });
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError('The connection ended after committing the task.');
      }
      return Response.json(responses.get(key));
    }));
    const test = stateStore();
    await expect(test.createAwaited(draft, [], commandId)).rejects.toMatchObject({ code: 'NETWORK' });
    const retried = await test.createAwaited(draft, [], commandId);
    expect(created).toBe(1);
    expect(keys).toEqual([commandId, commandId]);
    expect(retried).toBe(taskId);
    expect(test.state().tasks).toHaveLength(1);
    expect(test.state().tasks[0]?.code).toBe('NEW-1');
  });

  it('defaults a past calendar task start to its due date while preserving an explicit start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    expect(taskDraft({ dueDate: '2026-10-01' }).startDate).toBe('2026-10-01');
    expect(taskDraft({ dueDate: '2026-11-01' }).startDate).toBe('2026-10-23');
    expect(taskDraft({ dueDate: '2026-10-01', startDate: '2026-09-29' }).startDate).toBe('2026-09-29');
    vi.useRealTimers();
  });
  it('keeps the chosen start date in the optimistic task', () => {
    const state = workspaceReducer({ ...LIVE_EMPTY_STATE, meId: 'owner' }, { type: 'create-task', draft, authorId: 'owner' });
    expect(state.tasks[0]?.startDate).toBe(draft.startDate);
  });

  it('sends the chosen start date and completed attachments with an ordinary task create', async () => {
    const create = vi.spyOn(api.tasks, 'create').mockResolvedValue(detail);
    const test = stateStore();
    test.create();
    await vi.waitFor(() => expect(test.state().tasks[0]?.id).toBe(taskId));
    expect(create).toHaveBeenCalledWith('workspace-id', expect.objectContaining({ startDate: draft.startDate, attachmentIds: [attachmentId] }));
    expect(test.state().tasks[0]?.attachments[0]?.id).toBe(attachmentId);
  });

  it('waits for every upload before creating a task with its attachment ids', async () => {
    const test = stateStore();
    const upload = uploads();
    let finish!: (value: AttachmentView) => void;
    upload.complete.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const create = vi.spyOn(api.tasks, 'create').mockResolvedValue(detail);
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });
    const creating = test.createAwaited({ ...draft, attachments: [] }, [file]);
    await vi.waitFor(() => expect(upload.complete).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    finish(uploaded);
    await expect(creating).resolves.toBe(taskId);
    expect(create).toHaveBeenCalledWith('workspace-id', expect.objectContaining({ attachmentIds: [attachmentId] }));
    expect(test.state().tasks).toHaveLength(1);
  });

  it('rejects a failed upload without creating a task, aborting the reservation and allowing retry', async () => {
    const test = stateStore();
    const upload = uploads();
    upload.storage.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const create = vi.spyOn(api.tasks, 'create').mockResolvedValue(detail);
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });
    await expect(test.createAwaited({ ...draft, attachments: [] }, [file])).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
    expect(create).not.toHaveBeenCalled();
    expect(upload.abort).toHaveBeenCalledWith('workspace-id', attachmentId);
    expect(test.state().tasks).toHaveLength(0);
    expect(test.store.current.toast?.text).toBe('فایل پذیرفته نشد: نوع یا حجم آن مجاز نیست.');
    await expect(test.createAwaited({ ...draft, attachments: [] }, [file])).resolves.toBe(taskId);
    expect(upload.plan).toHaveBeenCalledTimes(2);
  });

  it('reuses a completed upload when task validation fails and the form is retried', async () => {
    const test = stateStore();
    const upload = uploads();
    const rejected = new ApiProblem(422, 'VALIDATION_FAILED', 'The task was rejected.', null);
    const create = vi.spyOn(api.tasks, 'create').mockRejectedValueOnce(rejected).mockResolvedValue(detail);
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });
    await expect(test.createAwaited({ ...draft, attachments: [] }, [file])).rejects.toBe(rejected);
    await expect(test.createAwaited({ ...draft, attachments: [] }, [file])).resolves.toBe(taskId);
    expect(upload.plan).toHaveBeenCalledTimes(1);
    expect(upload.complete).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(test.state().tasks).toHaveLength(1);
  });

  it('reports edit failures to the awaited caller and refreshes the server state without treating them as saved', async () => {
    const test = stateStore();
    vi.spyOn(api.tasks, 'get').mockResolvedValue(detail);
    const rejected = new ApiProblem(412, 'PRECONDITION_FAILED', 'The task changed.', null);
    const update = vi.spyOn(api.tasks, 'update').mockRejectedValue(rejected);
    await expect(test.store.saveTask(taskId, { title: 'Edited title', startDate: '2026-10-21', estimatedMinutes: 90 })).rejects.toBe(rejected);
    expect(update).toHaveBeenCalledWith('workspace-id', taskId, 1, { title: 'Edited title', startDate: '2026-10-21', estimatedMinutes: 90 });
    expect(test.state().tasks[0]?.title).toBe(detail.title);
  });

  it('reuses a completed upload after an attachment link failure and releases previews on either outcome', async () => {
    const test = stateStore();
    const upload = uploads();
    vi.spyOn(api.tasks, 'get').mockResolvedValue(detail);
    const rejected = new ApiProblem(0, 'NETWORK', 'The link was interrupted.', null);
    const attach = vi.spyOn(api.tasks, 'attach').mockRejectedValueOnce(rejected).mockResolvedValue(undefined);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const picked = { attachmentId: 'attachment-local-1', file: new File(['report'], 'report.txt', { type: 'text/plain' }), name: 'report.txt', previewUrl: 'blob:preview' };
    await expect(test.store.attachTaskFiles(taskId, [picked])).rejects.toBe(rejected);
    expect(revoke).toHaveBeenCalledWith(picked.previewUrl);
    await expect(test.store.attachTaskFiles(taskId, [picked])).resolves.toBeUndefined();
    expect(attach).toHaveBeenCalledTimes(2);
    expect(upload.plan).toHaveBeenCalledTimes(1);
    expect(test.state().tasks[0]?.attachments[0]?.id).toBe(attachmentId);
  });

  it('rejects an attachment removal failure and retains the canonical attachment', async () => {
    const test = stateStore();
    vi.spyOn(api.tasks, 'get').mockResolvedValue(detail);
    const rejected = new ApiProblem(403, 'FORBIDDEN', 'The attachment cannot be removed.', null);
    vi.spyOn(api.tasks, 'detach').mockRejectedValue(rejected);
    await expect(test.store.removeTaskAttachment(taskId, attachmentId)).rejects.toBe(rejected);
    expect(test.state().tasks[0]?.attachments[0]?.id).toBe(attachmentId);
  });

  it('does not replace newer saved fields and comments with an older attachment refresh response', async () => {
    const test = stateStore();
    uploads();
    const get = vi.spyOn(api.tasks, 'get').mockResolvedValue(detail);
    const update = vi.spyOn(api.tasks, 'update').mockResolvedValue(detail);
    await test.store.saveTask(taskId, { title: detail.title });
    let finishRefresh!: (value: TaskDetail) => void;
    get.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    vi.spyOn(api.tasks, 'attach').mockResolvedValue(undefined);
    const attaching = test.store.attachTaskFiles(taskId, [{ attachmentId: 'attachment-local-1', file: new File(['report'], 'report.txt', { type: 'text/plain' }), name: 'report.txt', previewUrl: 'blob:preview' }]);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const newer: TaskDetail = { ...detail, version: 2, title: 'Newer saved title', comments: [{ id: 'comment-id', authorId: 'owner', body: 'A new report', replyToId: null, createdAt: detail.createdAt, editedAt: null }] };
    update.mockResolvedValueOnce(newer);
    await test.store.saveTask(taskId, { title: newer.title });
    finishRefresh(detail);
    await attaching;
    expect(test.state().tasks[0]?.title).toBe(newer.title);
    expect(test.state().tasks[0]?.comments[0]?.body).toBe('A new report');
  });

  it('awaits a column move and rejects conflicts instead of reporting a saved placement', async () => {
    const test = stateStore();
    vi.spyOn(api.tasks, 'get').mockResolvedValue(detail);
    const rejected = new ApiProblem(412, 'PRECONDITION_FAILED', 'The task moved.', null);
    const move = vi.spyOn(api.tasks, 'move').mockRejectedValue(rejected);
    await expect(test.store.saveTaskColumn(taskId, 'next-column')).rejects.toBe(rejected);
    expect(move).toHaveBeenCalledWith('workspace-id', taskId, { columnId: 'next-column', expectedVersion: detail.version });
  });

  it('preserves the chosen start date when converting a message or note', async () => {
    const test = stateStore();
    vi.spyOn(api.notes, 'convert').mockResolvedValue({ task: detail, existing: false });
    await expect(test.createAwaited({ ...draft, sourceNoteId: 'note-id', attachments: [] })).resolves.toBe(taskId);
    expect(api.notes.convert).toHaveBeenCalledWith('workspace-id', 'note-id', expect.objectContaining({ startDate: draft.startDate }));
  });

  it('retries a conversion attachment failure against the existing source task without duplicating it', async () => {
    const sourceId = 'source-message';
    const test = stateStore({ messages: [{ id: sourceId, conversationId: 'conversation-id', authorId: 'owner', body: { kind: 'text', text: 'Follow up' }, sentAt: detail.createdAt, replyToId: null, reactions: [], readByIds: [], linkedTaskId: null, edited: false }] });
    const upload = uploads();
    const converted: TaskDetail = { ...detail, sourceMessageId: sourceId };
    const convert = vi.spyOn(api.conversations, 'convert').mockResolvedValueOnce({ task: converted, existing: false }).mockResolvedValue({ task: converted, existing: true });
    const create = vi.spyOn(api.tasks, 'create');
    vi.spyOn(api.tasks, 'get').mockResolvedValue(converted);
    const rejected = new ApiProblem(0, 'NETWORK', 'The attachment link was interrupted.', null);
    const attach = vi.spyOn(api.tasks, 'attach').mockRejectedValueOnce(rejected).mockResolvedValue(undefined);
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });
    const sourceDraft: TaskDraft = { ...draft, sourceMessageId: sourceId, attachments: [] };
    await expect(test.createAwaited(sourceDraft, [file])).rejects.toBe(rejected);
    expect(test.state().tasks).toHaveLength(0);
    expect(test.state().messages[0]?.linkedTaskId).toBeNull();
    await expect(test.createAwaited(sourceDraft, [file])).resolves.toBe(taskId);
    expect(convert).toHaveBeenCalledTimes(2);
    expect(convert).toHaveBeenCalledWith('workspace-id', 'conversation-id', sourceId, expect.objectContaining({ startDate: draft.startDate, attachmentIds: [] }));
    expect(create).not.toHaveBeenCalled();
    expect(attach).toHaveBeenLastCalledWith('workspace-id', taskId, attachmentId);
    expect(upload.plan).toHaveBeenCalledTimes(1);
    expect(test.state().tasks).toHaveLength(1);
    expect(test.state().messages[0]?.linkedTaskId).toBe(taskId);
  });
});
