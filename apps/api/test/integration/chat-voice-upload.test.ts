import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AttachmentView, FileLink, UploadView, WorkspaceView } from '@taskin/contracts';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { call, connect, type Connected, next, ok } from './socket-helpers.js';
import { expectStatus, usePlan, wsPath } from './work-helpers.js';

/** Container/header fixtures exercise the upload boundary, not a codec decoder. */
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}

function mp4(...handlers: string[]): Buffer {
  return Buffer.concat([
    box('ftyp', Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isommp42')),
    box('moov', ...handlers.map((type) => box('trak', box('mdia', box('hdlr', Buffer.alloc(8), Buffer.from(type), Buffer.alloc(12)))))),
    box('mdat', Buffer.alloc(32)),
  ]);
}

const FORMATS = [
  { name: 'voice.m4a', claimed: 'audio/mp4;codecs=mp4a.40.2', accepted: 'audio/mp4', bytes: mp4('soun') },
  { name: 'voice.webm', claimed: 'audio/webm;codecs=opus', accepted: 'audio/webm', bytes: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('A_OPUS'), Buffer.alloc(64)]) },
  { name: 'voice.aac', claimed: 'audio/aac', accepted: 'audio/aac', bytes: Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x01, 0x7f, 0xfc, 0, 0, 0, 0]) },
] as const;

describe('voice uploads through storage and the chat transports', () => {
  let t: TestApp;
  let owner: Session;
  let recipient: Session;
  let workspace: WorkspaceView;
  const connections: Connected[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    recipient = await addMember(t, owner, workspace.id, 'member');
  });
  afterEach(() => {
    for (const connection of connections.splice(0)) connection.socket.close();
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const plan = async (name: string, bytes: Buffer, claimed: string, as = owner, workspaceId = workspace.id) => {
    const response = await t.http().post(`${wsPath(workspaceId)}/files/uploads`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send({ fileName: name, size: bytes.length, contentType: claimed });
    expectStatus(response, 201);
    const upload = response.body as UploadView;
    if (upload.plan.kind !== 'post') throw new Error('expected a single voice-note POST');
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.plan.fields)) form.append(key, value);
    if (!('Content-Type' in upload.plan.fields)) form.append('Content-Type', claimed);
    form.append('file', new Blob([bytes], { type: claimed }), name);
    const stored = await fetch(upload.plan.url, { method: 'POST', body: form });
    expect(stored.status).toBeLessThan(300);
    return upload.attachment.id;
  };
  const complete = (as: Session, id: string) => t.http().post(`${base()}/files/uploads/${id}/complete`).set(bearer(as)).send({});
  const join = async (as: Session) => {
    const connected = await connect(t.baseUrl, as.accessToken);
    connections.push(connected);
    await ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    return connected;
  };

  it.each(FORMATS)('uploads, delivers and retries $name once across WebSocket and REST', async ({ name, claimed, accepted, bytes }) => {
    const group = await createConversation(t, owner, workspace.id, { kind: 'group', title: name, memberIds: [recipient.userId] });
    const attachmentId = await plan(name, bytes, claimed);
    // Another member cannot complete an upload reserved by its owner.
    expectStatus(await complete(recipient, attachmentId), 404);
    const completed = await complete(owner, attachmentId);
    expectStatus(completed, 200);
    expect(completed.body as AttachmentView).toMatchObject({ id: attachmentId, kind: 'audio', mimeType: accepted, status: 'scanning' });
    await t.flushNotifications();

    const linkPath = `${base()}/files/${attachmentId}/link?disposition=inline`;
    // Workspace membership alone does not grant access to another person's audio.
    expectStatus(await t.http().get(linkPath).set(bearer(recipient)), 404);
    const stolen = await t.http().post(`${base()}/conversations/${group.id}/messages`).set(bearer(recipient)).send({ clientMsgId: randomUUID(), kind: 'voice', attachmentId, durationSec: 2, waveform: [0, 50, 100] });
    expectStatus(stolen, 400);
    expect(stolen.body.code).toBe('VALIDATION_FAILED');

    const [senderSocket, recipientSocket] = await Promise.all([join(owner), join(recipient)]);
    const body = { clientMsgId: randomUUID(), kind: 'voice' as const, attachmentId, durationSec: 2, waveform: [0, 50, 100] };
    const sent = await ok(senderSocket.socket, 'message:send', { conversationId: group.id, ...body });
    expect(sent).toMatchObject({ seq: 1, duplicate: false });
    const event = await next(recipientSocket, 'message:new', (envelope) => envelope.data.id === sent.id);
    expect(event.data).toMatchObject({ kind: 'voice', clientMsgId: body.clientMsgId, attachment: { id: attachmentId, kind: 'audio', mimeType: accepted }, meta: { durationSec: 2, waveform: [0, 50, 100] } });

    const retry = await sendRest(t, owner, workspace.id, group.id, body, 200);
    expect(retry).toMatchObject({ id: sent.id, seq: 1, duplicate: true });
    const page = await history(t, recipient, workspace.id, group.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: sent.id, kind: 'voice', attachment: { id: attachmentId, mimeType: accepted } });

    const linked = await t.http().get(linkPath).set(bearer(recipient));
    expectStatus(linked, 200);
    expect(linked.body as FileLink).toMatchObject({ disposition: 'inline' });
    const playback = await fetch((linked.body as FileLink).url);
    expect(playback.status).toBe(200);
    expect(playback.headers.get('content-type')).toBe(accepted);
    expect(Buffer.from(await playback.arrayBuffer())).toEqual(bytes);
  });

  it('rejects video bytes claimed as audio and releases the upload reservation', async () => {
    const bytes = mp4('soun', 'vide');
    const before = await t.admin.query<{ used: string; reserved: string }>('select storage_used_bytes as used, storage_reserved_bytes as reserved from workspaces where id = $1', [workspace.id]);
    const attachmentId = await plan('voice.m4a', bytes, 'audio/mp4');
    const response = await complete(owner, attachmentId);
    expectStatus(response, 422);
    expect(response.body.code).toBe('UPLOAD_INVALID');
    const file = await t.admin.query<{ status: string }>('select status from attachments where id = $1', [attachmentId]);
    expect(file.rows[0]?.status).toBe('rejected');
    const after = await t.admin.query<{ used: string; reserved: string }>('select storage_used_bytes as used, storage_reserved_bytes as reserved from workspaces where id = $1', [workspace.id]);
    expect(after.rows).toEqual(before.rows);
  });

  it('does not accept an audio attachment from a different workspace', async () => {
    const other = await ownerWithWorkspace(t, 'صدای خصوصی');
    const bytes = FORMATS[0].bytes;
    const attachmentId = await plan('private.m4a', bytes, 'audio/mp4', other.owner, other.workspace.id);
    expectStatus(await t.http().post(`${wsPath(other.workspace.id)}/files/uploads/${attachmentId}/complete`).set(bearer(other.owner)).send({}), 200);
    await t.flushNotifications();
    const group = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'مرز فضای کاری', memberIds: [recipient.userId] });
    const socket = await join(owner);
    expect(await call(socket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'voice', attachmentId, durationSec: 2 })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect((await history(t, recipient, workspace.id, group.id)).items).toEqual([]);

  });
});
