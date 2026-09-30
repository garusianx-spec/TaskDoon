import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConversationDetail, ConversationView, MediaPage, NotificationPage, ReactionView, WorkspaceView } from '@taskin/contracts';
import { addMember, bearer, createTestApp, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { expectStatus, usePlan, wsPath } from './work-helpers.js';

describe('M3: conversations and messages over REST', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let ali: Session;
  let sara: Session;
  let guest: Session;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    ali = await addMember(t, owner, workspace.id, 'member');
    sara = await addMember(t, owner, workspace.id, 'member');
    guest = await addMember(t, owner, workspace.id, 'guest');
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => `${wsPath(workspace.id)}/conversations`;
  const sidebar = async (as: Session, query = '') => {
    const response = await t.http().get(`${base()}${query}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as ConversationView[];
  };

  it('opens one direct chat per pair, however many times and from which side', async () => {
    const [one, two] = await Promise.all([
      t.http().post(base()).set(bearer(ali)).set('Idempotency-Key', randomUUID()).send({ kind: 'direct', userId: sara.userId }),
      t.http().post(base()).set(bearer(sara)).set('Idempotency-Key', randomUUID()).send({ kind: 'direct', userId: ali.userId }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 201]);
    expect(one.body.id).toBe(two.body.id);
    expect(one.body).toMatchObject({ kind: 'direct', title: null, memberCount: 2 });
    expect([...one.body.memberIds].sort()).toEqual([ali.userId, sara.userId].sort());
    const self = await t.http().post(base()).set(bearer(ali)).set('Idempotency-Key', randomUUID()).send({ kind: 'direct', userId: ali.userId });
    expectStatus(self, 400);
    // Guests hold messages:view only by default: they cannot start conversations.
    const guestDm = await t.http().post(base()).set(bearer(guest)).set('Idempotency-Key', randomUUID()).send({ kind: 'direct', userId: ali.userId });
    expectStatus(guestDm, 403);
  });

  it('numbers messages 1, 2, 3 …, keeps retries idempotent, and counts unread for the others', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'تیم فروش', memberIds: [sara.userId] });
    expect(group).toMatchObject({ myRole: 'owner', memberCount: 2, lastSeq: 0 });
    const clientMsgId = randomUUID();
    const first = await sendRest(t, ali, workspace.id, group.id, { clientMsgId, text: 'سلام' });
    expect(first).toMatchObject({ seq: 1, duplicate: false });
    const retry = await sendRest(t, ali, workspace.id, group.id, { clientMsgId, text: 'سلام' }, 200);
    expect(retry).toMatchObject({ id: first.id, seq: 1, duplicate: true });
    await sendRest(t, ali, workspace.id, group.id, { text: 'پیام دوم' });
    expect((await sidebar(sara)).find((entry) => entry.id === group.id)).toMatchObject({ lastSeq: 2, unreadCount: 2, lastReadSeq: 0 });
    expectStatus(await t.http().post(`${base()}/${group.id}/read`).set(bearer(sara)).send({ seq: 1 }), 204);
    expect((await sidebar(sara)).find((entry) => entry.id === group.id)?.unreadCount).toBe(1);

    // Sending reads everything up to your own message.
    await sendRest(t, sara, workspace.id, group.id, { text: 'پاسخ' });
    const forSara = (await sidebar(sara)).find((entry) => entry.id === group.id);
    expect(forSara).toMatchObject({ lastSeq: 3, unreadCount: 0, lastReadSeq: 3, lastMessage: { seq: 3, text: 'پاسخ', authorId: sara.userId } });
    const forAli = (await sidebar(ali)).find((entry) => entry.id === group.id);
    expect(forAli).toMatchObject({ unreadCount: 1, lastReadSeq: 2 });
    // Cursors never move back, nor past the newest message.
    expectStatus(await t.http().post(`${base()}/${group.id}/read`).set(bearer(sara)).send({ seq: 1 }), 204);
    expectStatus(await t.http().post(`${base()}/${group.id}/read`).set(bearer(sara)).send({ seq: 99 }), 204);
    const detail = (await t.http().get(`${base()}/${group.id}`).set(bearer(ali))).body as ConversationDetail;
    expect(detail.members.find((entry) => entry.userId === sara.userId)).toMatchObject({ lastReadSeq: 3, lastDeliveredSeq: 3 });
  });

  it('pages history by seq, oldest first, in both directions', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'صفحه‌بندی', memberIds: [sara.userId] });
    for (let index = 1; index <= 7; index += 1) await sendRest(t, ali, workspace.id, group.id, { text: `پیام ${index}` });
    const newest = await history(t, sara, workspace.id, group.id, 'limit=3');
    expect(newest.items.map((item) => item.seq)).toEqual([5, 6, 7]);
    expect(newest).toMatchObject({ olderBeforeSeq: 5, newerAfterSeq: null });
    const older = await history(t, sara, workspace.id, group.id, `beforeSeq=${newest.olderBeforeSeq}&limit=3`);
    expect(older.items.map((item) => item.seq)).toEqual([2, 3, 4]);
    const oldest = await history(t, sara, workspace.id, group.id, `beforeSeq=${older.olderBeforeSeq}&limit=3`);
    expect(oldest).toMatchObject({ olderBeforeSeq: null });
    expect(oldest.items.map((item) => item.seq)).toEqual([1]);
    const after = await history(t, sara, workspace.id, group.id, 'afterSeq=4&limit=2');
    expect(after.items.map((item) => item.seq)).toEqual([5, 6]);
    expect(after.newerAfterSeq).toBe(6);
    // Outsiders do not learn it exists.
    expectStatus(await t.http().get(`${base()}/${group.id}/messages`).set(bearer(guest)), 404);
    expectStatus(await t.http().get(`${base()}/${group.id}/messages`).set(bearer(owner)), 404);
  });

  it('lets only admins post in an announcement channel', async () => {
    const channel = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'اطلاعیه‌ها', postPolicy: 'admins', memberIds: [ali.userId] });
    await sendRest(t, owner, workspace.id, channel.id, { text: 'اطلاعیه' });
    const refused = await t.http().post(`${base()}/${channel.id}/messages`).set(bearer(ali)).send({ clientMsgId: randomUUID(), kind: 'text', text: 'نه' });
    expectStatus(refused, 403);
    expect(refused.body.code).toBe('POSTING_RESTRICTED');
    expectStatus(await t.http().put(`${base()}/${channel.id}/messages/${(await history(t, ali, workspace.id, channel.id)).items[0]?.id}/reactions/${encodeURIComponent('👍')}`).set(bearer(ali)), 200);
  });

  it('lists public channels to non-guests, who can read and join them; guests cannot see them', async () => {
    const channel = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'عمومی', isPrivate: false });
    await sendRest(t, owner, workspace.id, channel.id, { text: 'خوش آمدید' });
    const publicForSara = await sidebar(sara, '?scope=public');
    expect(publicForSara.find((entry) => entry.id === channel.id)).toMatchObject({ myRole: null, unreadCount: 0 });
    expect(await sidebar(guest, '?scope=public')).toEqual([]);
    expectStatus(await t.http().get(`${base()}/${channel.id}`).set(bearer(guest)), 404);

    expect((await history(t, sara, workspace.id, channel.id)).items).toHaveLength(1);
    const notYet = await t.http().post(`${base()}/${channel.id}/messages`).set(bearer(sara)).send({ clientMsgId: randomUUID(), kind: 'text', text: 'سلام' });
    expectStatus(notYet, 403);
    const joined = await t.http().put(`${base()}/${channel.id}/members/${sara.userId}`).set(bearer(sara)).send({});
    expectStatus(joined, 200);
    expect(joined.body).toMatchObject({ role: 'member', lastReadSeq: 1 });
    await sendRest(t, sara, workspace.id, channel.id, { text: 'سلام' });
    // Joining yourself cannot make you an admin, and guests cannot join.
    expectStatus(await t.http().put(`${base()}/${channel.id}/members/${guest.userId}`).set(bearer(guest)).send({}), 404);
  });

  it('keeps edits to the author within 48 hours, and deletes by the author or a moderator', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'ویرایش', memberIds: [sara.userId] });
    const mine = await sendRest(t, sara, workspace.id, group.id, { text: 'متن اول' });
    const edited = await t.http().patch(`${base()}/${group.id}/messages/${mine.id}`).set(bearer(sara)).send({ text: 'متن ویرایش‌شده' });
    expectStatus(edited, 200);
    expect(edited.body).toMatchObject({ text: 'متن ویرایش‌شده', editedAt: expect.any(String) });
    expectStatus(await t.http().patch(`${base()}/${group.id}/messages/${mine.id}`).set(bearer(ali)).send({ text: 'نه' }), 403);
    await t.admin.query(`update messages set created_at = now() - interval '49 hours' where id = $1`, [mine.id]);
    const late = await t.http().patch(`${base()}/${group.id}/messages/${mine.id}`).set(bearer(sara)).send({ text: 'دیر' });
    expectStatus(late, 409);
    expect(late.body.code).toBe('EDIT_WINDOW_CLOSED');

    const saras = await sendRest(t, sara, workspace.id, group.id, { text: 'برای حذف' });
    const alis = await sendRest(t, ali, workspace.id, group.id, { text: 'از علی' });
    // A plain member cannot delete someone else's message; the group's owner (Ali) can.
    expectStatus(await t.http().delete(`${base()}/${group.id}/messages/${alis.id}`).set(bearer(sara)), 403);
    expectStatus(await t.http().delete(`${base()}/${group.id}/messages/${saras.id}`).set(bearer(ali)), 204);
    const page = await history(t, sara, workspace.id, group.id);
    expect(page.items.find((item) => item.id === saras.id)).toMatchObject({ deleted: true, text: null, seq: saras.seq });
    // The path must name the message's own conversation.
    const other = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'دیگری', memberIds: [sara.userId] });
    expectStatus(await t.http().delete(`${base()}/${other.id}/messages/${alis.id}`).set(bearer(ali)), 404);
  });

  it('aggregates reactions per emoji, in the order people reacted', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'واکنش', memberIds: [sara.userId] });
    const message = await sendRest(t, ali, workspace.id, group.id, { text: 'واکنش بدهید' });
    const heart = encodeURIComponent('❤️');
    const path = `${base()}/${group.id}/messages/${message.id}/reactions`;
    expect((await t.http().put(`${path}/${heart}`).set(bearer(sara))).body as ReactionView).toEqual({ emoji: '❤️', userIds: [sara.userId] });
    expect((await t.http().put(`${path}/${heart}`).set(bearer(ali))).body as ReactionView).toEqual({ emoji: '❤️', userIds: [sara.userId, ali.userId] });
    expect((await t.http().delete(`${path}/${heart}`).set(bearer(sara))).body as ReactionView).toEqual({ emoji: '❤️', userIds: [ali.userId] });
    expectStatus(await t.http().put(`${path}/${encodeURIComponent('not an emoji')}`).set(bearer(ali)), 400);
    const view = (await history(t, ali, workspace.id, group.id)).items[0];
    expect(view?.reactions).toEqual([{ emoji: '❤️', userIds: [ali.userId] }]);
  });

  it('notifies mentioned members and the author of the message replied to', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'اشاره', memberIds: [sara.userId, owner.userId] });
    const question = await sendRest(t, owner, workspace.id, group.id, { text: 'کسی هست؟' });
    await sendRest(t, ali, workspace.id, group.id, { text: `<@${sara.userId}> لطفا ببین`, replyToId: question.id });
    // Mentioning someone outside the conversation mentions nobody.
    await sendRest(t, ali, workspace.id, group.id, { text: `<@${guest.userId}> سلام` });
    await t.flushNotifications();
    const inbox = async (as: Session) => ((await t.http().get(`/api/v1/me/notifications?workspaceId=${workspace.id}&filter=mentions`).set(bearer(as))).body as NotificationPage).items;
    expect((await inbox(sara)).find((entry) => entry.kind === 'mention')).toMatchObject({ targetType: 'message', payload: { conversationId: group.id, seq: 2 }, subject: 'اشاره' });
    expect((await inbox(owner)).find((entry) => entry.kind === 'reply')).toMatchObject({ targetType: 'message', actorId: ali.userId });
    expect(await inbox(guest)).toEqual([]);
    const page = await history(t, sara, workspace.id, group.id);
    expect(page.items[1]).toMatchObject({ mentionIds: [sara.userId], replyToId: question.id });
    expect(page.items[2]?.mentionIds).toEqual([]);
    // Silenced members hear nothing.
    expectStatus(await t.http().put(`${base()}/${group.id}/me`).set(bearer(sara)).send({ notificationLevel: 'none' }), 200);
    await sendRest(t, ali, workspace.id, group.id, { text: `<@${sara.userId}> دوباره` });
    await t.flushNotifications();
    expect((await inbox(sara)).filter((entry) => entry.kind === 'mention')).toHaveLength(1);
  });

  it('keeps per-member settings: pin, mute and hide (a hidden chat returns with its next message)', async () => {
    const dm = await createConversation(t, ali, workspace.id, { kind: 'direct', userId: owner.userId });
    const pinned = await t.http().put(`${base()}/${dm.id}/me`).set(bearer(ali)).send({ pinned: true, mutedUntil: '2030-01-01T00:00:00.000Z' });
    expectStatus(pinned, 200);
    expect(pinned.body).toMatchObject({ pinned: true, mutedUntil: '2030-01-01T00:00:00.000Z' });
    expect((await sidebar(ali))[0]?.id).toBe(dm.id);
    expectStatus(await t.http().put(`${base()}/${dm.id}/me`).set(bearer(ali)).send({ hidden: true }), 200);
    expect((await sidebar(ali)).map((entry) => entry.id)).not.toContain(dm.id);
    expect((await sidebar(ali, '?includeHidden=true')).map((entry) => entry.id)).toContain(dm.id);
    await sendRest(t, owner, workspace.id, dm.id, { text: 'هستی؟' });
    expect((await sidebar(ali)).map((entry) => entry.id)).toContain(dm.id);
    // Direct chats have exactly their two people.
    expectStatus(await t.http().put(`${base()}/${dm.id}/members/${sara.userId}`).set(bearer(ali)).send({}), 409);
  });

  it('hands ownership on when the last owner leaves, and archives a conversation nobody is in', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'مالکیت', memberIds: [sara.userId, owner.userId] });
    expectStatus(await t.http().put(`${base()}/${group.id}/members/${sara.userId}`).set(bearer(ali)).send({ role: 'admin' }), 200);
    // An admin cannot make owners, nor remove one.
    expectStatus(await t.http().put(`${base()}/${group.id}/members/${owner.userId}`).set(bearer(sara)).send({ role: 'owner' }), 403);
    expectStatus(await t.http().delete(`${base()}/${group.id}/members/${ali.userId}`).set(bearer(sara)), 403);
    // The owner leaves: the longest-standing admin takes over.
    expectStatus(await t.http().delete(`${base()}/${group.id}/members/${ali.userId}`).set(bearer(ali)), 204);
    const detail = (await t.http().get(`${base()}/${group.id}`).set(bearer(sara))).body as ConversationDetail;
    expect(detail.members.find((entry) => entry.userId === sara.userId)?.role).toBe('owner');
    expect(detail.memberCount).toBe(2);
    expectStatus(await t.http().delete(`${base()}/${group.id}/members/${owner.userId}`).set(bearer(sara)), 204);
    expectStatus(await t.http().delete(`${base()}/${group.id}/members/${sara.userId}`).set(bearer(sara)), 204);
    const archived = await t.admin.query<{ archived: boolean }>('select archived_at is not null as archived from conversations where id = $1', [group.id]);
    expect(archived.rows[0]?.archived).toBe(true);
  });

  it('serves shared media by tab: files, media and links', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'رسانه', memberIds: [sara.userId] });
    const insertFile = async (name: string, kind: string, mime: string) =>
      (
        await t.admin.query<{ id: string }>(
          `insert into attachments (workspace_id, uploader_id, bucket, object_key, file_name, mime_type, kind, size_bytes, status)
           values ($1::uuid, $2, 'taskin-files', 'ws/' || $1::text || '/att/' || gen_random_uuid(), $3, $4, $5, 10, 'ready') returning id`,
          [workspace.id, ali.userId, name, mime, kind],
        )
      ).rows[0]?.id as string;
    await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: await insertFile('گزارش.pdf', 'document', 'application/pdf'), text: 'گزارش' });
    await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: await insertFile('عکس.png', 'image', 'image/png') });
    await sendRest(t, ali, workspace.id, group.id, { text: 'دو پیوند: https://taskin.ir/a و http://example.com/b?x=1' });
    await sendRest(t, sara, workspace.id, group.id, { text: 'بدون پیوند' });
    // Someone else's file cannot be sent.
    const stolen = await t.http().post(`${base()}/${group.id}/messages`).set(bearer(sara)).send({ clientMsgId: randomUUID(), kind: 'file', attachmentId: await insertFile('x.pdf', 'document', 'application/pdf') });
    expectStatus(stolen, 400);
    const tab = async (name: string) => ((await t.http().get(`${base()}/${group.id}/media?tab=${name}`).set(bearer(sara))).body as MediaPage).items;
    expect((await tab('files')).map((item) => item.attachment?.name)).toEqual(['گزارش.pdf']);
    expect((await tab('media')).map((item) => item.attachment?.kind)).toEqual(['image']);
    expect((await tab('links')).map((item) => item.url)).toEqual(['https://taskin.ir/a', 'http://example.com/b?x=1']);
    expect(await tab('audio')).toEqual([]);
  });

  it('remembers a picture sent as a file, and a retry of it stays one message', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'عکس به صورت فایل', memberIds: [sara.userId] });
    const picture = async (name: string) =>
      (
        await t.admin.query<{ id: string }>(
          `insert into attachments (workspace_id, uploader_id, bucket, object_key, file_name, mime_type, kind, size_bytes, status)
           values ($1::uuid, $2, 'taskin-files', 'ws/' || $1::text || '/att/' || gen_random_uuid(), $3, 'image/png', 'image', 10, 'ready') returning id`,
          [workspace.id, ali.userId, name],
        )
      ).rows[0]?.id as string;
    const clientMsgId = randomUUID();
    const original = await picture('اصل.png');
    const sent = await sendRest(t, ali, workspace.id, group.id, { clientMsgId, kind: 'file', attachmentId: original, asFile: true });
    const retried = await sendRest(t, ali, workspace.id, group.id, { clientMsgId, kind: 'file', attachmentId: original, asFile: true }, 200);
    expect(retried).toMatchObject({ id: sent.id, duplicate: true });
    await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: await picture('عکس.png') });
    // Only files carry it: a text message says nothing of it.
    await sendRest(t, ali, workspace.id, group.id, { text: 'متن', asFile: true });
    const page = await history(t, sara, workspace.id, group.id);
    expect(page.items.map((item) => [item.attachment?.name ?? item.text, item.meta])).toEqual([
      ['اصل.png', { asFile: true }],
      ['عکس.png', null],
      ['متن', null],
    ]);
    const wrong = await t.http().post(`${base()}/${group.id}/messages`).set(bearer(ali)).send({ clientMsgId: randomUUID(), kind: 'file', attachmentId: await picture('x.png'), asFile: 'yes' });
    expectStatus(wrong, 400);
  });

  it('serves only the history the plan keeps', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'تاریخچه', memberIds: [sara.userId] });
    const old = await sendRest(t, ali, workspace.id, group.id, { text: 'خیلی قدیمی' });
    await sendRest(t, ali, workspace.id, group.id, { text: 'تازه' });
    await t.admin.query(`update messages set created_at = now() - interval '100 days' where id = $1`, [old.id]);
    expect((await history(t, sara, workspace.id, group.id)).items).toHaveLength(2);
    await usePlan(t, workspace.id, 'free'); // 90 days of history
    expect((await history(t, sara, workspace.id, group.id)).items.map((item) => item.text)).toEqual(['تازه']);
    await usePlan(t, workspace.id, 'team');
  });

  it('takes a member removed from the workspace out of its conversations', async () => {
    const leaving = await addMember(t, owner, workspace.id, 'member');
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'خروج', memberIds: [leaving.userId] });
    expectStatus(await t.http().delete(`${wsPath(workspace.id)}/members/${leaving.userId}`).set(bearer(owner)), 204);
    const detail = (await t.http().get(`${base()}/${group.id}`).set(bearer(ali))).body as ConversationDetail;
    expect(detail.members.map((entry) => entry.userId)).toEqual([ali.userId]);
  });
});
