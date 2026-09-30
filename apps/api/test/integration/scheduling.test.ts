import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MessageView, ScheduledMessageView, WorkingHoursView, WorkspaceView } from '@taskin/contracts';
import { AutoReplyService } from '../../src/modules/chat/auto-reply.service.js';
import { ScheduledMessagesService } from '../../src/modules/chat/scheduled-messages.service.js';
import { Clock } from '../../src/platform/clock/clock.js';
import { addMember, bearer, createTestApp, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { connect, type Connected, next, ok, pause, received } from './socket-helpers.js';
import { createProject, expectStatus, outboxEvents, wsPath } from './work-helpers.js';

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe('Phase 3.2: scheduled messages', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let member: Session;
  let other: Session;
  let groupId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    member = await addMember(t, owner, workspace.id, 'member');
    other = await addMember(t, owner, workspace.id, 'member');
    groupId = (await createConversation(t, owner, workspace.id, { kind: 'group', title: 'برنامه‌ریزی', memberIds: [member.userId, other.userId] })).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const schedule = async (as: Session, conversationId: string, body: Record<string, unknown>, status = 201) => {
    const response = await t
      .http()
      .post(`${base()}/conversations/${conversationId}/scheduled-messages`)
      .set(bearer(as))
      .send({ clientMsgId: randomUUID(), kind: 'text', scheduledAt: inMinutes(60), ...body });
    expectStatus(response, status);
    return response.body as ScheduledMessageView;
  };
  const pending = async (as: Session, conversationId?: string): Promise<ScheduledMessageView[]> => {
    const response = await t.http().get(`${base()}/scheduled-messages${conversationId ? `?conversationId=${conversationId}` : ''}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as ScheduledMessageView[];
  };
  /** Moves a schedule's time into the past (the clock the worker checks is the database's). */
  const makeDue = (id: string) => t.admin.query(`update scheduled_messages set scheduled_at = now() - interval '1 second' where id = $1`, [id]);
  const subscribed = async (as: Session): Promise<Connected> => {
    const connected = await connect(t.baseUrl, as.accessToken);
    await ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    return connected;
  };

  it('schedules a message for its author only; a retry returns the same schedule', async () => {
    const clientMsgId = randomUUID();
    const at = inMinutes(90);
    const scheduled = await schedule(member, groupId, { clientMsgId, text: 'یادآوری جلسه فردا', scheduledAt: at });
    expect(scheduled).toMatchObject({ conversationId: groupId, authorId: member.userId, kind: 'text', text: 'یادآوری جلسه فردا', status: 'pending', clientMsgId, scheduledAt: at, messageId: null });
    const retry = await schedule(member, groupId, { clientMsgId, text: 'یادآوری جلسه فردا', scheduledAt: at }, 200);
    expect(retry.id).toBe(scheduled.id);
    expect((await pending(member, groupId)).map((entry) => entry.id)).toEqual([scheduled.id]);
    // Nobody else sees it before it is sent, not even the workspace owner.
    expect(await pending(owner, groupId)).toEqual([]);
    expect((await history(t, member, workspace.id, groupId)).items.some((message) => message.text === 'یادآوری جلسه فردا')).toBe(false);
    expect((await outboxEvents(t, 'message.scheduled', groupId)).map((event) => event.payload)).toContainEqual({ scheduledId: scheduled.id, authorId: member.userId, scheduledAt: at });
    // Row-level security keeps it to its author as well.
    const visibleTo = async (userId: string) => {
      const client = await t.appPool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)`, [workspace.id, userId]);
        const { rows } = await client.query<{ count: string }>('select count(*) from scheduled_messages');
        return Number(rows[0]?.count);
      } finally {
        await client.query('rollback');
        client.release();
      }
    };
    expect(await visibleTo(owner.userId)).toBe(0);
    expect(await visibleTo(member.userId)).toBe(1);
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${scheduled.id}`).set(bearer(member)), 204);
  });

  it('refuses a time in the past or too far ahead, an empty text, and conversations the author cannot post in', async () => {
    const expectRefused = async (body: Record<string, unknown>, status: number, conversationId = groupId, as = member) => {
      const response = await t
        .http()
        .post(`${base()}/conversations/${conversationId}/scheduled-messages`)
        .set(bearer(as))
        .send({ clientMsgId: randomUUID(), kind: 'text', text: 'متن', scheduledAt: inMinutes(60), ...body });
      expectStatus(response, status);
      return response.body as { code: string };
    };
    await expectRefused({ scheduledAt: new Date(Date.now() - 60_000).toISOString() }, 400);
    await expectRefused({ scheduledAt: new Date(Date.now() + 2_000).toISOString() }, 400);
    await expectRefused({ scheduledAt: new Date(Date.now() + 400 * 24 * 3600_000).toISOString() }, 400);
    await expectRefused({ scheduledAt: 'فردا' }, 400);
    await expectRefused({ text: '   ' }, 400);
    await expectRefused({ kind: 'file' }, 400);
    const secret = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'محرمانه', memberIds: [] });
    await expectRefused({}, 404, secret.id);
    const announcements = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'اطلاعیه‌ها', postPolicy: 'admins', memberIds: [member.userId] });
    expect((await expectRefused({}, 403, announcements.id)).code).toBe('POSTING_RESTRICTED');
  });

  it('is sent by the worker when due, as a plain message, and its author hears it went out', async () => {
    const reader = await subscribed(other);
    const author = await subscribed(member);
    const scheduled = await schedule(member, groupId, { text: 'گزارش هفتگی آماده است' });
    // Its delayed job does nothing before its time …
    await t.flushNotifications({ delayed: true });
    expect((await pending(member, groupId)).map((entry) => entry.id)).toContain(scheduled.id);
    // … and sends it once due.
    await makeDue(scheduled.id);
    expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, member.userId)).toBe('sent');
    const arrived = await next(reader, 'message:new', (envelope) => envelope.data.clientMsgId === scheduled.clientMsgId);
    expect(arrived.data).toMatchObject({ conversationId: groupId, authorId: member.userId, kind: 'text', text: 'گزارش هفتگی آماده است' });
    const update = await next(author, 'scheduled:updated', (envelope) => envelope.data.id === scheduled.id && envelope.data.status === 'sent');
    expect(update.data.messageId).toBe(arrived.data.id);
    expect(update.workspaceId).toBe(workspace.id);
    // Only the author hears about their schedules.
    expect(received(reader, 'scheduled:updated')).toEqual([]);
    expect(await pending(member, groupId)).toEqual([]);
    const messages = (await history(t, other, workspace.id, groupId)).items.filter((message) => message.clientMsgId === scheduled.clientMsgId);
    expect(messages).toHaveLength(1);
    // A second dispatch (the sweep, a retried job) finds nothing to do.
    expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, member.userId)).toBe('skipped');
    expect(await t.app.get(ScheduledMessagesService).dispatchDue()).toEqual({ sent: 0, failed: 0 });
    reader.socket.close();
    author.socket.close();
  });

  it('goes out through its delayed job: the relay schedules it for its time', async () => {
    const scheduled = await schedule(member, groupId, { text: 'از صف کار' });
    await makeDue(scheduled.id);
    await t.flushNotifications({ delayed: true });
    const sent = (await history(t, member, workspace.id, groupId)).items.find((message) => message.clientMsgId === scheduled.clientMsgId);
    expect(sent).toMatchObject({ authorId: member.userId, text: 'از صف کار' });
  });

  it('«ارسال فوری» sends it at once; then it can neither be sent again nor cancelled', async () => {
    const scheduled = await schedule(member, groupId, { text: 'همین حالا', scheduledAt: inMinutes(600) });
    const response = await t.http().post(`${base()}/scheduled-messages/${scheduled.id}/send`).set(bearer(member));
    expectStatus(response, 200);
    const sent = response.body as ScheduledMessageView;
    expect(sent).toMatchObject({ id: scheduled.id, status: 'sent' });
    const message = (await history(t, other, workspace.id, groupId)).items.find((entry) => entry.id === sent.messageId);
    expect(message).toMatchObject({ text: 'همین حالا', authorId: member.userId, clientMsgId: scheduled.clientMsgId });
    const again = await t.http().post(`${base()}/scheduled-messages/${scheduled.id}/send`).set(bearer(member));
    expectStatus(again, 409);
    expect(again.body.code).toBe('SCHEDULED_MESSAGE_CLOSED');
    const cancel = await t.http().delete(`${base()}/scheduled-messages/${scheduled.id}`).set(bearer(member));
    expectStatus(cancel, 409);
    expect(cancel.body.code).toBe('SCHEDULED_MESSAGE_CLOSED');
    // Someone else's schedule does not exist for you.
    const mine = await schedule(member, groupId, { text: 'مال من' });
    expectStatus(await t.http().post(`${base()}/scheduled-messages/${mine.id}/send`).set(bearer(other)), 404);
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${mine.id}`).set(bearer(other)), 404);
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${mine.id}`).set(bearer(member)), 204);
  });

  it('«لغو» cancels it for good: its time comes and nothing is sent', async () => {
    const scheduled = await schedule(member, groupId, { text: 'لغو خواهد شد' });
    const author = await subscribed(member);
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${scheduled.id}`).set(bearer(member)), 204);
    expect((await next(author, 'scheduled:updated', (envelope) => envelope.data.id === scheduled.id)).data.status).toBe('cancelled');
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${scheduled.id}`).set(bearer(member)), 204);
    await makeDue(scheduled.id);
    expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, member.userId)).toBe('skipped');
    expect((await history(t, member, workspace.id, groupId)).items.some((message) => message.clientMsgId === scheduled.clientMsgId)).toBe(false);
    author.socket.close();
  });

  it('is marked failed, with the reason, when it can no longer go out', async () => {
    const channel = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'تیم فروش', memberIds: [member.userId] });
    const scheduled = await schedule(member, channel.id, { text: 'به همه' });
    const author = await subscribed(member);
    expectStatus(await t.http().patch(`${base()}/conversations/${channel.id}`).set(bearer(owner)).send({ postPolicy: 'admins' }), 200);
    await makeDue(scheduled.id);
    expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, member.userId)).toBe('failed');
    const update = await next(author, 'scheduled:updated', (envelope) => envelope.data.id === scheduled.id);
    expect(update.data).toMatchObject({ status: 'failed', failureCode: 'POSTING_RESTRICTED', messageId: null });
    expect(await pending(member, channel.id)).toEqual([]);
    author.socket.close();
  });

  it('keeps its file until it is sent, then sends it as a file message', async () => {
    const { rows } = await t.admin.query<{ id: string }>(
      `insert into attachments (workspace_id, uploader_id, bucket, object_key, file_name, mime_type, kind, size_bytes, status, created_at)
       values ($1::uuid, $2, 'taskin-files', 'ws/' || $1::text || '/att/' || gen_random_uuid(), 'برنامه.pdf', 'application/pdf', 'document', 10, 'ready', now() - interval '2 days')
       returning id`,
      [workspace.id, member.userId],
    );
    const attachmentId = rows[0]?.id as string;
    // Somebody else's file cannot be scheduled.
    await schedule(other, groupId, { kind: 'file', attachmentId }, 400);
    const scheduled = await schedule(member, groupId, { kind: 'file', attachmentId, text: 'برنامه سفر' });
    expect(scheduled.attachment).toMatchObject({ id: attachmentId, name: 'برنامه.pdf', kind: 'document' });
    const collectable = async () => (await t.admin.query<{ attachment_id: string }>('select attachment_id from app.attachments_due_for_gc(100)')).rows.map((row) => row.attachment_id);
    expect(await collectable()).not.toContain(attachmentId);
    await makeDue(scheduled.id);
    expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, member.userId)).toBe('sent');
    const message = (await history(t, other, workspace.id, groupId)).items.find((entry) => entry.clientMsgId === scheduled.clientMsgId) as MessageView;
    expect(message).toMatchObject({ kind: 'file', text: 'برنامه سفر', attachment: expect.objectContaining({ id: attachmentId }) });
    expect(await collectable()).not.toContain(attachmentId);
  });

  it('is picked up by the sweep when its job was lost, and from a dispatcher that died holding it', async () => {
    const lost = await schedule(member, groupId, { text: 'کار گم‌شده' });
    const held = await schedule(member, groupId, { text: 'دست نگه‌داشته' });
    const busy = await schedule(member, groupId, { text: 'در حال ارسال' });
    await t.admin.query(`update scheduled_messages set scheduled_at = now() - interval '5 minutes' where id = any($1)`, [[lost.id, held.id, busy.id]]);
    await t.admin.query(`update scheduled_messages set claimed_at = now() - interval '3 minutes' where id = $1`, [held.id]);
    await t.admin.query(`update scheduled_messages set claimed_at = now() where id = $1`, [busy.id]);
    expect(await t.app.get(ScheduledMessagesService).dispatchDue()).toEqual({ sent: 2, failed: 0 });
    const texts = (await history(t, member, workspace.id, groupId)).items.map((message) => message.text);
    expect(texts).toEqual(expect.arrayContaining(['کار گم‌شده', 'دست نگه‌داشته']));
    expect(texts).not.toContain('در حال ارسال');
    // A schedule someone is sending right now cannot be cancelled under them.
    const cancel = await t.http().delete(`${base()}/scheduled-messages/${busy.id}`).set(bearer(member));
    expectStatus(cancel, 409);
    await t.admin.query(`update scheduled_messages set claimed_at = null where id = $1`, [busy.id]);
    expectStatus(await t.http().delete(`${base()}/scheduled-messages/${busy.id}`).set(bearer(member)), 204);
  });

  it('allows at most 100 pending messages in one conversation', async () => {
    const dm = await createConversation(t, other, workspace.id, { kind: 'direct', userId: owner.userId });
    await t.admin.query(
      `insert into scheduled_messages (workspace_id, conversation_id, author_id, kind, body_text, client_msg_id, scheduled_at)
       select $1, $2, $3, 'text', 'پیام ' || g, gen_random_uuid(), now() + interval '1 day' from generate_series(1, 100) g`,
      [workspace.id, dm.id, other.userId],
    );
    const refused = await t
      .http()
      .post(`${base()}/conversations/${dm.id}/scheduled-messages`)
      .set(bearer(other))
      .send({ clientMsgId: randomUUID(), kind: 'text', text: 'یکی بیشتر', scheduledAt: inMinutes(60) });
    expectStatus(refused, 409);
    expect(refused.body.code).toBe('SCHEDULE_LIMIT_REACHED');
    expect(await pending(other, dm.id)).toHaveLength(100);
  });
});

describe('Phase 3.2: working hours and the out-of-office auto-reply', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let away: Session;
  let writer: Session;
  let third: Session;

  // 2026-10-02 is a Friday; 2026-10-03 a Saturday. Tehran is UTC+03:30.
  const FRIDAY_NOON = new Date('2026-10-02T08:30:00Z');
  const SATURDAY_TEN = new Date('2026-10-03T06:30:00Z');

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    away = await addMember(t, owner, workspace.id, 'member');
    writer = await addMember(t, owner, workspace.id, 'member');
    third = await addMember(t, owner, workspace.id, 'member');
  });
  afterEach(() => {
    t.app.get(Clock).pin(null);
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const put = async (as: Session, body: Record<string, unknown>, status = 200) => {
    const response = await t
      .http()
      .put(`${base()}/me/working-hours`)
      .set(bearer(as))
      .send({ autoReplyEnabled: true, days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'], start: '09:00', end: '17:00', message: 'تا شنبه در دسترس نیستم.', ...body });
    expectStatus(response, status);
    return response.body as WorkingHoursView;
  };
  /** Sends, then waits for any auto-reply it sets off (they run after the sender's answer). */
  const sendAndSettle = async (as: Session, conversationId: string, text: string) => {
    await sendRest(t, as, workspace.id, conversationId, { text });
    await t.app.get(AutoReplyService).idle();
  };

  it('shows the defaults until saved: Saturday to Wednesday, nine to six, auto-reply off', async () => {
    const response = await t.http().get(`${base()}/me/working-hours`).set(bearer(third));
    expectStatus(response, 200);
    expect(response.body).toEqual({
      autoReplyEnabled: false,
      days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'],
      start: '09:00',
      end: '18:00',
      message: expect.stringContaining('خارج از ساعت کاری'),
      timeZone: 'Asia/Tehran',
      updatedAt: null,
    });
  });

  it('saves working hours and refuses hours that are not hours', async () => {
    const saved = await put(away, { days: ['wednesday', 'saturday'] });
    expect(saved).toMatchObject({ autoReplyEnabled: true, days: ['saturday', 'wednesday'], start: '09:00', end: '17:00', message: 'تا شنبه در دسترس نیستم.' });
    expect(saved.updatedAt).not.toBeNull();
    expect((await t.http().get(`${base()}/me/working-hours`).set(bearer(away))).body).toEqual(saved);
    await put(away, { days: ['someday'] }, 400);
    await put(away, { days: ['saturday', 'saturday'] }, 400);
    await put(away, { start: '25:00' }, 400);
    await put(away, { start: '9:00' }, 400);
    await put(away, { start: '10:00', end: '10:00' }, 400);
    await put(away, { message: '' }, 400);
    await put(away, { message: 'ب'.repeat(501) }, 400);
    const audited = await t.admin.query(`select 1 from audit_logs where action = 'member.working_hours.update' and resource_id = $1`, [away.userId]);
    expect(audited.rows.length).toBeGreaterThan(0);
  });

  it('answers a direct message outside working hours, once a day per person', async () => {
    await put(away, {});
    const dm = await createConversation(t, writer, workspace.id, { kind: 'direct', userId: away.userId });
    const listener = await connect(t.baseUrl, writer.accessToken);
    await ok(listener.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    t.app.get(Clock).pin(FRIDAY_NOON);
    await sendAndSettle(writer, dm.id, 'سلام، وقت دارید؟');
    const [reply] = await autoRepliesAs(writer, dm.id);
    expect(reply).toMatchObject({ authorId: away.userId, kind: 'text', text: 'تا شنبه در دسترس نیستم.', meta: { autoReply: true } });
    expect((await next(listener, 'message:new', (envelope) => envelope.data.authorId === away.userId)).data.meta).toEqual({ autoReply: true });
    // The same person again the same day: no second answer.
    await sendAndSettle(writer, dm.id, 'فوری است');
    t.app.get(Clock).pin(new Date(FRIDAY_NOON.getTime() + 23 * 3600_000));
    await sendAndSettle(writer, dm.id, 'هنوز منتظرم');
    expect(await autoRepliesAs(writer, dm.id)).toHaveLength(1);
    // A day later (still outside the hours: Saturday 22:30 in Tehran), it answers again.
    t.app.get(Clock).pin(new Date(FRIDAY_NOON.getTime() + 34 * 3600_000));
    await sendAndSettle(writer, dm.id, 'دوباره سلام');
    expect(await autoRepliesAs(writer, dm.id)).toHaveLength(2);
    listener.socket.close();
  });

  it('stays quiet inside working hours, when switched off, and for the away member’s own messages', async () => {
    await put(away, {});
    const dm = await createConversation(t, third, workspace.id, { kind: 'direct', userId: away.userId });
    t.app.get(Clock).pin(SATURDAY_TEN);
    await sendAndSettle(third, dm.id, 'صبح بخیر');
    expect(await autoRepliesAs(third, dm.id)).toHaveLength(0);
    t.app.get(Clock).pin(FRIDAY_NOON);
    await sendAndSettle(away, dm.id, 'پیام از خودم');
    expect(await autoRepliesAs(third, dm.id)).toHaveLength(0);
    await put(away, { autoReplyEnabled: false });
    await sendAndSettle(third, dm.id, 'جمعه هم کار داریم');
    expect(await autoRepliesAs(third, dm.id)).toHaveLength(0);
  });

  it('never answers in groups, channels or project channels', async () => {
    await put(away, {});
    t.app.get(Clock).pin(FRIDAY_NOON);
    const group = await createConversation(t, writer, workspace.id, { kind: 'group', title: 'گروه', memberIds: [away.userId] });
    const channel = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'کانال', memberIds: [away.userId, writer.userId] });
    const project = await createProject(t, owner, workspace.id, { name: 'پروژه همگام', memberIds: [away.userId, writer.userId] });
    const projectChannel = (await t.http().get(`${base()}/conversations`).set(bearer(writer))).body.find((entry: { projectId: string | null }) => entry.projectId === project.id);
    for (const conversationId of [group.id, channel.id, projectChannel.id as string]) {
      await sendAndSettle(writer, conversationId, 'کسی هست؟');
      expect(await autoRepliesAs(writer, conversationId)).toHaveLength(0);
    }
  });

  it('never answers an auto-reply: two people who are both away get one answer each at most', async () => {
    const onLeave = await addMember(t, owner, workspace.id, 'member');
    await put(away, {});
    await put(onLeave, { message: 'در مرخصی هستم.' });
    t.app.get(Clock).pin(new Date(FRIDAY_NOON.getTime() + 7 * 24 * 3600_000));
    const between = await createConversation(t, away, workspace.id, { kind: 'direct', userId: onLeave.userId });
    await sendAndSettle(away, between.id, 'سلام');
    await pause(100);
    await t.app.get(AutoReplyService).idle();
    const messages = (await history(t, away, workspace.id, between.id)).items;
    expect(messages.map((message) => [message.authorId, message.text])).toEqual([
      [away.userId, 'سلام'],
      [onLeave.userId, 'در مرخصی هستم.'],
    ]);
  });

  it('gives the day’s slot back when the answer cannot be posted', async () => {
    await put(away, {});
    const dm = await createConversation(t, owner, workspace.id, { kind: 'direct', userId: away.userId });
    // The away member may no longer post: the messages:create cell is taken from members.
    await t.admin.query(`delete from role_permissions where workspace_id = $1 and module = 'messages' and action = 'create' and role_id = (select id from roles where workspace_id = $1 and key = 'member')`, [workspace.id]);
    await t.admin.query(`update workspaces set rbac_version = rbac_version + 1 where id = $1`, [workspace.id]);
    await t.redis.del(`${t.env.REDIS_PREFIX}:cache:rbac:${workspace.id}`);
    t.app.get(Clock).pin(FRIDAY_NOON);
    await sendAndSettle(owner, dm.id, 'گزارش را بفرستید');
    expect(await autoRepliesAs(owner, dm.id)).toHaveLength(0);
    const { rows } = await t.admin.query(`select 1 from auto_reply_log where workspace_id = $1 and user_id = $2 and sender_id = $3`, [workspace.id, away.userId, owner.userId]);
    expect(rows).toHaveLength(0);
  });

  async function autoRepliesAs(as: Session, conversationId: string): Promise<MessageView[]> {
    return (await history(t, as, workspace.id, conversationId)).items.filter((message) => message.meta !== null && 'autoReply' in message.meta);
  }
});
