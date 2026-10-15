import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentView, Conversation, SendMessageBody } from '@taskin/contracts';
import { api } from '../src/api/endpoints';
import { http } from '../src/api/http';
import { RealtimeClient } from '../src/api/realtime';
import { LIVE_EMPTY_STATE } from '../src/store/initial-state';
import { LiveStore } from '../src/store/live/live-store';
import { workspaceReducer, type VoiceRecording, type WorkspaceAction, type WorkspaceState } from '../src/store/workspace-reducer';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const conversation: Conversation = {
  id: '01900000-0000-7000-8000-000000000011', kind: 'group', title: 'گفتگو',
  memberIds: ['owner'], pinned: false, muted: false, unreadCount: 0, topic: '', tone: 'teal',
};
const localId = 'message-local-201';
const attachmentId = '01900000-0000-7000-8000-000000000012';
const messageId = '01900000-0000-7000-8000-000000000013';
const sent = { id: messageId, seq: 1, createdAt: '2026-10-15T00:00:00.000Z', duplicate: false };
const waveform = [5, 25, 100] as const;

/** Exercise the real reducer, LiveStore and upload helper. Only network boundaries are controlled. */
function delivery(mimeType = 'audio/webm;codecs=opus', storageStatus = 204) {
  const recording: VoiceRecording = {
    blob: new Blob([new Uint8Array([1, 3, 5, 7])], { type: mimeType }),
    durationSec: 2.4, waveform, previewUrl: 'blob:voice-preview',
  };
  const attachment: AttachmentView = {
    id: attachmentId, name: 'voice', kind: 'audio', mimeType: mimeType.split(';')[0]!,
    size: recording.blob.size, status: 'scanning', uploadedById: 'owner', uploadedAt: sent.createdAt,
  };
  const plan = vi.spyOn(api.files, 'plan').mockResolvedValue({
    attachment,
    plan: { kind: 'post', url: 'https://storage.example.test/upload', fields: { key: 'voice-object', 'Content-Type': mimeType } },
    expiresInSeconds: 60,
  });
  const complete = vi.spyOn(api.files, 'complete').mockResolvedValue(attachment);
  const abort = vi.spyOn(api.files, 'abort').mockResolvedValue(undefined);
  const storage = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: storageStatus }));
  vi.stubGlobal('fetch', storage);
  const socket = vi.spyOn(RealtimeClient.prototype, 'send').mockResolvedValue({ ok: true, ...sent });
  const store = new LiveStore();
  // Begin at the loaded workspace boundary; no session restore or real socket connection is needed.
  Object.assign(store, { status: { ...store.current, phase: 'ready' }, workspaceId: 'workspace-id' });
  let state: WorkspaceState = { ...LIVE_EMPTY_STATE, meId: 'owner', conversations: [conversation] };
  store.attach(() => state, (incoming) => { state = workspaceReducer(state, incoming); });
  const dispatch = (action: WorkspaceAction) => {
    const previous = state;
    state = workspaceReducer(state, action);
    store.effect(action, previous, state);
  };
  const send = () => dispatch({ type: 'send-voice', conversationId: conversation.id, authorId: 'owner', messageId: localId, recording });
  return { recording, plan, complete, abort, storage, socket, store, dispatch, send, state: () => state };
}

describe('voice upload and message delivery', () => {
  it.each([
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/aac', 'aac'],
  ])('uploads %s with the matching filename and voice metadata', async (mimeType: string, extension: string) => {
    const test = delivery(mimeType);
    test.send();
    await vi.waitFor(() => expect(test.state().messages[0]?.id).toBe(messageId));
    expect(test.plan).toHaveBeenCalledWith('workspace-id', {
      fileName: expect.stringMatching(new RegExp('^voice-[0-9]+\\.' + extension + '$')),
      size: test.recording.blob.size, contentType: mimeType,
    });
    const [storageUrl, options] = test.storage.mock.calls[0]!;
    expect(storageUrl).toBe('https://storage.example.test/upload');
    expect(options?.method).toBe('POST');
    const form = options?.body as FormData;
    expect(form.get('Content-Type')).toBe(mimeType);
    const file = form.get('file') as File;
    expect(file.type).toBe(mimeType);
    expect(await file.arrayBuffer()).toEqual(await test.recording.blob.arrayBuffer());
    expect(test.complete).toHaveBeenCalledWith('workspace-id', attachmentId, {});
    expect(test.socket).toHaveBeenCalledWith(conversation.id, {
      clientMsgId: expect.any(String), kind: 'voice', attachmentId, durationSec: 2.4, waveform,
    });
    expect(test.state().messages[0]?.body).toEqual({
      kind: 'voice', durationSec: 2.4, waveform, src: 'blob:voice-preview', attachmentId,
    });
  });

  it('resends the same attachment and client message id after a rejected send', async () => {
    const test = delivery();
    test.socket.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' }).mockResolvedValueOnce({ ok: true, ...sent });
    test.send();
    await vi.waitFor(() => expect(test.state().messages[0]?.failed).toBe(true));
    const original = test.socket.mock.calls[0]![1];
    test.dispatch({ type: 'resend-message', messageId: localId });
    await vi.waitFor(() => expect(test.state().messages[0]?.id).toBe(messageId));
    expect(test.socket).toHaveBeenCalledTimes(2);
    expect(test.socket.mock.calls[1]![1]).toEqual(original);
    expect(test.plan).toHaveBeenCalledTimes(1);
    expect(test.storage).toHaveBeenCalledTimes(1);
    expect(test.complete).toHaveBeenCalledTimes(1);
    expect(test.state().messages).toHaveLength(1);
    expect(test.state().messages[0]?.failed).toBe(false);
  });

  it('keeps the voice note unsent and explains a storage rejection', async () => {
    const test = delivery('audio/mp4', 403);
    test.send();
    await vi.waitFor(() => expect(test.state().messages[0]?.failed).toBe(true));
    expect(test.state().messages[0]?.id).toBe(localId);
    expect(test.state().messages[0]?.body.kind).toBe('voice');
    expect(test.store.current.toast?.text).toBe('فایل پذیرفته نشد: نوع یا حجم آن مجاز نیست.');
    expect(test.abort).toHaveBeenCalledWith('workspace-id', attachmentId);
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.socket).not.toHaveBeenCalled();
  });

  it('keeps the recording and explains an API or gateway rejection', async () => {
    const test = delivery('audio/ogg');
    test.socket.mockResolvedValue({ ok: false, code: 'FORBIDDEN' });
    test.send();
    await vi.waitFor(() => expect(test.state().messages[0]?.failed).toBe(true));
    expect(test.state().messages[0]?.id).toBe(localId);
    expect(test.state().messages[0]?.body).toEqual({
      kind: 'voice', durationSec: 2.4, waveform, src: 'blob:voice-preview',
    });
    expect(test.store.current.toast?.text).toBeTruthy();
    expect(test.state().messages).toHaveLength(1);
  });

  it('uses the same voice payload over HTTP when the socket is offline', async () => {
    const test = delivery();
    test.socket.mockResolvedValue({ ok: false, code: 'SERVICE_UNAVAILABLE' });
    const rest = vi.spyOn(http, 'post').mockResolvedValue(sent);
    test.send();
    await vi.waitFor(() => expect(test.state().messages[0]?.id).toBe(messageId));
    const body: SendMessageBody = test.socket.mock.calls[0]![1];
    expect(rest).toHaveBeenCalledWith('/workspaces/workspace-id/conversations/' + conversation.id + '/messages', body, { idempotent: true });
    expect(test.plan).toHaveBeenCalledTimes(1);
  });
});
