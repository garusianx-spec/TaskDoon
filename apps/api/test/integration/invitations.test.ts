import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateInvitationsResult, WorkspaceView } from '@taskin/contracts';
import { addMember, bearer, createTestApp, idempotencyKey, invite, localForm, ownerWithWorkspace, randomPhone, type Session, signIn, stepUp, type TestApp } from './harness.js';

const persianDigits = (value: string) => value.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);

/** The token of the newest invitation texted to `phone` (OTP texts to the same number are skipped). */
function smsToken(t: TestApp, phone: string): string {
  const message = [...t.sms.sent].reverse().find((sms) => sms.to === phone && sms.template === 'invite');
  return tokenFrom(message?.tokens.link);
}

function tokenFrom(link: string | undefined): string {
  const token = link ? new URL(link).searchParams.get('token') : null;
  if (!token) throw new Error('no invitation token');
  return token;
}

describe('invitations', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
  });
  afterAll(async () => {
    await t?.close();
  });

  const accept = (session: Session, token: string) => t.http().post('/api/v1/invitations/accept').set(bearer(session)).send({ token });

  it('normalises, classifies and deduplicates what was typed', async () => {
    const member = await addMember(t, owner, workspace.id, 'member');
    const pendingPhone = randomPhone();
    await invite(t, owner, workspace.id, [localForm(pendingPhone)]);
    const fresh = randomPhone();
    const result: CreateInvitationsResult = await invite(t, owner, workspace.id, [
      persianDigits(`+98 ${fresh.slice(3, 6)} ${fresh.slice(6, 9)} ${fresh.slice(9)}`),
      localForm(fresh),
      'New.Person@Rahnama.IR',
      'bad-address',
      '12345',
      localForm(member.phone),
      `0098${pendingPhone.slice(3)}`,
    ]);
    expect(result.created.map((i) => [i.channel, i.address])).toEqual([
      ['sms', fresh],
      ['email', 'new.person@rahnama.ir'],
    ]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['invalid_address', 'invalid_address', 'already_member', 'already_invited']);
  });

  it('texts the link, emails the link, and never stores the token in the clear', async () => {
    const phone = randomPhone();
    const email = `invitee-${Date.now()}@example.test`;
    await invite(t, owner, workspace.id, [localForm(phone), email]);
    const outbox = await t.admin.query<{ payload: { tokens?: { link?: string }; params?: { link?: string } } }>(
      `select payload from outbox_events where event_type in ('notification.sms', 'notification.email') and published_at is null`,
    );
    for (const { payload } of outbox.rows) expect(JSON.stringify(payload)).not.toContain('token=');
    await t.flushNotifications();
    const sms = t.sms.lastTo(phone);
    expect(sms?.template).toBe('invite');
    expect(sms?.tokens.link).toMatch(/^https:\/\/app\.taskin\.test\/invite\?token=/);
    expect(sms?.text).toContain(workspace.name);
    const mail = t.mail.find((message) => message.to === email);
    expect(mail?.subject).toContain(workspace.name);
    expect(mail?.text).toMatch(/https:\/\/app\.taskin\.test\/invite\?token=/);
  });

  it('SMS invitations only work for the number they were sent to', async () => {
    const phone = randomPhone();
    await invite(t, owner, workspace.id, [localForm(phone)], 'guest');
    await t.flushNotifications();
    const token = smsToken(t, phone);
    const intruder = await signIn(t, randomPhone());
    const wrong = await accept(intruder, token);
    expect(wrong.body.code).toBe('INVITATION_ADDRESS_MISMATCH');
    const invitee = await signIn(t, phone);
    const right = await accept(invitee, token);
    expect(right.body).toEqual({ workspaceId: workspace.id, role: 'guest' });
    expect((await accept(invitee, token)).body.code).toBe('INVITATION_INVALID');
    const me = await t.http().get('/api/v1/me').set(bearer(invitee));
    expect(me.body.workspaces.map((w: { id: string }) => w.id)).toContain(workspace.id);
  });

  it('email invitations work for whoever holds the link', async () => {
    const email = `link-${Date.now()}@example.test`;
    await invite(t, owner, workspace.id, [email]);
    await t.flushNotifications();
    const link = t.mail.find((message) => message.to === email)?.text.match(/https:\S+/)?.[0];
    const anyone = await signIn(t, randomPhone());
    expect((await accept(anyone, tokenFrom(link))).status).toBe(200);
  });

  it('revoked and expired invitations are dead', async () => {
    const revokedPhone = randomPhone();
    const created = await invite(t, owner, workspace.id, [localForm(revokedPhone)]);
    await t.flushNotifications();
    const invitationId = created.created[0]?.id;
    expect((await t.http().delete(`/api/v1/workspaces/${workspace.id}/invitations/${invitationId}`).set(bearer(owner))).status).toBe(204);
    const revoked = await accept(await signIn(t, revokedPhone), smsToken(t, revokedPhone));
    expect(revoked.body.code).toBe('INVITATION_INVALID');

    const expiredPhone = randomPhone();
    const later = await invite(t, owner, workspace.id, [localForm(expiredPhone)]);
    await t.flushNotifications();
    await t.admin.query(`update invitations set expires_at = now() - interval '1 minute' where id = $1`, [later.created[0]?.id]);
    const expired = await accept(await signIn(t, expiredPhone), smsToken(t, expiredPhone));
    expect(expired.body.code).toBe('INVITATION_INVALID');
    // A lapsed invitation does not block inviting the number again.
    const again = await invite(t, owner, workspace.id, [localForm(expiredPhone)]);
    expect(again.created).toHaveLength(1);
  });

  it('lists pending invitations', async () => {
    const list = await t.http().get(`/api/v1/workspaces/${workspace.id}/invitations`).set(bearer(owner));
    expect(list.status).toBe(200);
    expect(list.body.every((i: { status: string }) => i.status === 'pending')).toBe(true);
  });

  it('respects rank: nobody invites the owner, a manager cannot invite a manager', async () => {
    const asOwner = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(randomPhone()) }], role: 'owner' });
    expect(asOwner.body.code).toBe('OWNER_IMMUTABLE');
    const manager = await addMember(t, owner, workspace.id, 'manager');
    const managerRole = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(manager))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(randomPhone()) }], role: 'member' });
    // Managers hold members:view and members:assign, not members:create.
    expect(managerRole.status).toBe(403);
  });

  it('honours the email domain allowlist', async () => {
    await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ settings: { allowedEmailDomains: ['rahnama.ir'] } });
    const result = await invite(t, owner, workspace.id, ['ali@rahnama.ir', 'ali@elsewhere.test']);
    expect(result.created.map((i) => i.address)).toEqual(['ali@rahnama.ir']);
    expect(result.rejected).toEqual([{ address: 'ali@elsewhere.test', reason: 'domain_not_allowed' }]);
    await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ settings: { allowedEmailDomains: [] } });
  });

  it('takes seats atomically against the plan: parallel accepts never overfill it', async () => {
    const { owner: small, workspace: team } = await ownerWithWorkspace(t, 'تیم کوچک');
    // This file's database only: two seats on the free plan, one of them the owner's.
    await t.admin.query(`update plans set limits = jsonb_set(limits, '{maxMembers}', '2') where id = 'free'`);
    try {
      const phones = [randomPhone(), randomPhone(), randomPhone()];
      await invite(t, small, team.id, phones.map(localForm));
      await t.flushNotifications();
      const sessions = await Promise.all(phones.map((phone) => signIn(t, phone)));
      const results = await Promise.all(sessions.map((session, i) => accept(session, smsToken(t, phones[i] ?? ''))));
      expect(results.map((r) => r.status).sort()).toEqual([200, 402, 402]);
      expect(results.filter((r) => r.status === 402).every((r) => r.body.code === 'PLAN_LIMIT_REACHED')).toBe(true);
      const view = await t.http().get(`/api/v1/workspaces/${team.id}`).set(bearer(small));
      expect(view.body.memberCount).toBe(2);
      // Removing a member frees the seat again.
      const joined = sessions[results.findIndex((r) => r.status === 200)] as Session;
      await t.http().delete(`/api/v1/workspaces/${team.id}/members/${joined.userId}`).set(bearer(await stepUp(t, small)));
      expect((await t.http().get(`/api/v1/workspaces/${team.id}`).set(bearer(small))).body.memberCount).toBe(1);
    } finally {
      await t.admin.query(`update plans set limits = jsonb_set(limits, '{maxMembers}', '10') where id = 'free'`);
    }
  });
});
