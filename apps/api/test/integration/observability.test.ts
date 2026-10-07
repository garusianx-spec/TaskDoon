import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, OtpVerifyResult, RoleView, TaskDetail, UploadTicket, UploadView, WorkflowView } from '@taskin/contracts';
import { OPENAPI_FILE } from '../../src/openapi.js';
import {
  addMember,
  bearer,
  createTestApp,
  idempotencyKey,
  invite,
  lastCode,
  localForm,
  ownerWithWorkspace,
  randomIp,
  randomPhone,
  refreshCookies,
  type Session,
  signIn,
  sqlCount,
  STRONG_PASSWORD,
  type TestApp,
  withAdminPassword,
} from './harness.js';
import { createProject, createTask, usePlan } from './work-helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

/** Sends `bytes` to the store with a presigned POST, as the browser would. */
async function postToStore(plan: UploadView['plan'], bytes: Buffer, contentType: string): Promise<void> {
  if (plan.kind !== 'post') throw new Error('expected a POST plan');
  const form = new FormData();
  for (const [name, value] of Object.entries(plan.fields)) form.append(name, value);
  form.append('Content-Type', contentType);
  form.append('file', new Blob([bytes], { type: contentType }), 'upload');
  const response = await fetch(plan.url, { method: 'POST', body: form });
  if (response.status >= 300) throw new Error(`store refused the upload: ${response.status}`);
}

interface Call {
  readonly template: string;
  readonly requestId: string;
  readonly traceId: string;
}

const ORIGIN = 'https://app.taskin.test';

describe('M1 checklist: audit trail and correlation', () => {
  let t: TestApp;
  const calls: Call[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  /** Sends one request with a fresh request id and trace, and records which route it exercised. */
  async function traced(method: 'post' | 'put' | 'patch' | 'delete', template: string, path: string, setup: (request: Test) => Test = (r) => r) {
    const requestId = `req-${randomBytes(6).toString('hex')}`;
    const traceId = randomBytes(16).toString('hex');
    const request = t
      .http()
      .set('X-Forwarded-For', randomIp())
      [method](path)
      .set('X-Request-Id', requestId)
      .set('traceparent', `00-${traceId}-${randomBytes(8).toString('hex')}-01`);
    const response = await setup(request);
    expect(response.status, `${method.toUpperCase()} ${path}: ${JSON.stringify(response.body)}`).toBeLessThan(300);
    expect(response.headers['x-request-id']).toBe(requestId);
    calls.push({ template: `${method.toUpperCase()} ${template}`, requestId, traceId });
    return response;
  }

  it('writes an audit row, with request id and trace id, for every mutating route', async () => {
    // Auth: sign-up through the OTP flow, then every other auth mutation.
    const phone = randomPhone();
    const challenge = await traced('post', '/api/v1/auth/otp/request', '/api/v1/auth/otp/request', (r) => r.send({ phone: localForm(phone) }));
    const verify = await traced('post', '/api/v1/auth/otp/verify', '/api/v1/auth/otp/verify', (r) =>
      r.send({ challengeId: challenge.body.challengeId, code: lastCode(t, phone) }),
    );
    const signup = await traced('post', '/api/v1/auth/signup', '/api/v1/auth/signup', (r) =>
      r.send({ signupToken: (verify.body as Extract<OtpVerifyResult, { status: 'signup_required' }>).signupToken, fullName: 'سارا کاظمی' }),
    );
    let user: Session = {
      userId: (signup.body as AuthSession).user.id,
      phone,
      accessToken: (signup.body as AuthSession).accessToken,
      sessionId: (signup.body as AuthSession).sessionId,
      cookies: '',
      csrf: '',
    };
    refreshCookies(user, signup.headers['set-cookie']);
    const refreshed = await traced('post', '/api/v1/auth/refresh', '/api/v1/auth/refresh', (r) =>
      r.set('Cookie', user.cookies).set('X-CSRF-Token', user.csrf).set('Origin', ORIGIN),
    );
    refreshCookies(user, refreshed.headers['set-cookie']);
    user = { ...user, accessToken: (refreshed.body as AuthSession).accessToken };
    await traced('post', '/api/v1/auth/password', '/api/v1/auth/password', (r) => r.set(bearer(user)).send({ newPassword: STRONG_PASSWORD }));
    const stepped = await traced('post', '/api/v1/auth/step-up', '/api/v1/auth/step-up', (r) => r.set(bearer(user)).send({ password: STRONG_PASSWORD }));
    user = { ...user, accessToken: (stepped.body as AuthSession).accessToken };
    await traced('patch', '/api/v1/me', '/api/v1/me', (r) => r.set(bearer(user)).send({ fullName: 'سارا کاظمی‌نژاد', email: 'sara@rahnama.ir' }));
    const extra = await signIn(t, phone);
    await traced('delete', '/api/v1/auth/sessions/{id}', `/api/v1/auth/sessions/${extra.sessionId}`, (r) => r.set(bearer(user)));
    await signIn(t, phone);
    await traced('delete', '/api/v1/auth/sessions', '/api/v1/auth/sessions?others=true', (r) => r.set(bearer(user)));

    // Workspaces.
    const created = await traced('post', '/api/v1/workspaces', '/api/v1/workspaces', (r) =>
      r.set(bearer(user)).set('Idempotency-Key', idempotencyKey()).send({ name: 'ردیابی' }),
    );
    const ws = `/api/v1/workspaces/${created.body.id}`;
    const ticket = (await traced('post', '/api/v1/uploads/workspace-icon', '/api/v1/uploads/workspace-icon', (r) => r.set(bearer(user)))).body as UploadTicket;
    expect(ticket.key).toMatch(/^tmp\/icons\//);
    await traced('patch', '/api/v1/workspaces/{workspaceId}', ws, (r) => r.set(bearer(user)).send({ description: 'برای آزمون ردیابی' }));
    await traced('patch', '/api/v1/workspaces/{workspaceId}/me/presence', `${ws}/me/presence`, (r) => r.set(bearer(user)).send({ presence: 'away' }));
    const department = await traced('post', '/api/v1/workspaces/{workspaceId}/departments', `${ws}/departments`, (r) => r.set(bearer(user)).send({ name: 'حقوقی' }));
    await traced('patch', '/api/v1/workspaces/{workspaceId}/departments/{id}', `${ws}/departments/${department.body.id}`, (r) => r.set(bearer(user)).send({ position: 9 }));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/departments/{id}', `${ws}/departments/${department.body.id}`, (r) => r.set(bearer(user)));

    // Invitations: one revoked, one accepted by a new member who is then changed and removed.
    const revocable = await traced('post', '/api/v1/workspaces/{workspaceId}/invitations', `${ws}/invitations`, (r) =>
      r.set(bearer(user)).set('Idempotency-Key', idempotencyKey()).send({ recipients: [{ address: 'temp@rahnama.ir' }], role: 'member' }),
    );
    await traced('delete', '/api/v1/workspaces/{workspaceId}/invitations/{id}', `${ws}/invitations/${revocable.body.created[0].id}`, (r) => r.set(bearer(user)));
    const joinerPhone = randomPhone();
    await invite(t, user, created.body.id, [localForm(joinerPhone)]);
    await t.flushNotifications();
    const inviteSms = [...t.sms.sent].reverse().find((sms) => sms.to === joinerPhone && sms.template === 'invite');
    const token = new URL(inviteSms?.tokens.link ?? '').searchParams.get('token');
    const joiner = await withAdminPassword(t, await signIn(t, joinerPhone));
    await traced('post', '/api/v1/invitations/accept', '/api/v1/invitations/accept', (r) => r.set(bearer(joiner)).send({ token }));
    await traced('patch', '/api/v1/workspaces/{workspaceId}/members/{userId}', `${ws}/members/${joiner.userId}`, (r) => r.set(bearer(user)).send({ role: 'admin' }));

    // Roles.
    const roles = (await t.http().get(`${ws}/roles`).set(bearer(user))).body as RoleView[];
    const guest = roles.find((role) => role.key === 'guest') as RoleView;
    await traced('put', '/api/v1/workspaces/{workspaceId}/roles/{roleId}/permissions', `${ws}/roles/${guest.id}/permissions`, (r) =>
      r.set(bearer(user)).set('If-Match', `"${guest.version}"`).send({ permissions: guest.permissions }),
    );
    await traced('post', '/api/v1/workspaces/{workspaceId}/roles/reset-defaults', `${ws}/roles/reset-defaults`, (r) => r.set(bearer(user)));

    // Projects, the board and tasks (M2).
    const idem = (r: Test) => r.set(bearer(user)).set('Idempotency-Key', idempotencyKey());
    const project = (await traced('post', '/api/v1/workspaces/{workspaceId}/projects', `${ws}/projects`, (r) => idem(r).send({ key: 'TRC', name: 'ردیابی' }))).body;
    const pj = `${ws}/projects/${project.id}`;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', pj, (r) => r.set(bearer(user)).send({ description: 'شرح پروژه' }));
    await traced('put', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/members/{userId}', `${pj}/members/${joiner.userId}`, (r) =>
      r.set(bearer(user)).send({ role: 'contributor' }),
    );
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/members/{userId}', `${pj}/members/${joiner.userId}`, (r) => r.set(bearer(user)));
    await traced('put', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/star', `${pj}/star`, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/star', `${pj}/star`, (r) => r.set(bearer(user)));
    const workflow = (await traced('post', '/api/v1/workspaces/{workspaceId}/workflow/columns', `${ws}/workflow/columns`, (r) => idem(r).send({ projectId: project.id, title: 'موقت' })))
      .body as WorkflowView;
    const column = workflow.columns.find((entry) => entry.title === 'موقت');
    const col = `${ws}/workflow/columns/${column?.id}`;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/workflow/columns/{columnId}', col, (r) => r.set(bearer(user)).send({ tone: 'red' }));
    const label = (await traced('post', '/api/v1/workspaces/{workspaceId}/labels', `${ws}/labels`, (r) => r.set(bearer(user)).send({ name: 'برچسب' }))).body;

    // Files: one completed upload, one abandoned.
    const planned = (
      await traced('post', '/api/v1/workspaces/{workspaceId}/files/uploads', `${ws}/files/uploads`, (r) =>
        idem(r).send({ fileName: 'سند.pdf', size: PDF.length, contentType: 'application/pdf' }),
      )
    ).body as UploadView;
    await postToStore(planned.plan, PDF, 'application/pdf');
    await traced('post', '/api/v1/workspaces/{workspaceId}/files/uploads/{attachmentId}/complete', `${ws}/files/uploads/${planned.attachment.id}/complete`, (r) =>
      r.set(bearer(user)).send({}),
    );
    const abandoned = (await idem(t.http().post(`${ws}/files/uploads`)).send({ fileName: 'رها.pdf', size: 10, contentType: 'application/pdf' })).body as UploadView;
    await traced('post', '/api/v1/workspaces/{workspaceId}/files/uploads/{attachmentId}/abort', `${ws}/files/uploads/${abandoned.attachment.id}/abort`, (r) => r.set(bearer(user)));
    await t.flushNotifications();

    const task = (await traced('post', '/api/v1/workspaces/{workspaceId}/tasks', `${ws}/tasks`, (r) => idem(r).send({ projectId: project.id, title: 'ردیابی', labelIds: [label.id] })))
      .body as TaskDetail;
    const tk = `${ws}/tasks/${task.id}`;
    const patched = (await traced('patch', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}', tk, (r) => r.set(bearer(user)).set('If-Match', `"${task.version}"`).send({ priority: 'high' })))
      .body as TaskDetail;
    await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/move', `${tk}/move`, (r) =>
      r.set(bearer(user)).send({ columnId: column?.id, expectedVersion: patched.version }),
    );
    await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/complete', `${tk}/complete`, (r) => r.set(bearer(user)).send({ completed: true }));
    await traced('put', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/star', `${tk}/star`, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/star', `${tk}/star`, (r) => r.set(bearer(user)));
    const subtask = (await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks', `${tk}/subtasks`, (r) => r.set(bearer(user)).send({ title: 'گام' }))).body;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}', `${tk}/subtasks/${subtask.id}`, (r) => r.set(bearer(user)).send({ done: true }));
    await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}/move', `${tk}/subtasks/${subtask.id}/move`, (r) => r.set(bearer(user)).send({}));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/subtasks/{subtaskId}', `${tk}/subtasks/${subtask.id}`, (r) => r.set(bearer(user)));
    const comment = (await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/comments', `${tk}/comments`, (r) => r.set(bearer(user)).send({ body: 'نظر' }))).body;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/comments/{commentId}', `${tk}/comments/${comment.id}`, (r) => r.set(bearer(user)).send({ body: 'نظر تازه' }));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/comments/{commentId}', `${tk}/comments/${comment.id}`, (r) => r.set(bearer(user)));
    await traced('post', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/attachments', `${tk}/attachments`, (r) => r.set(bearer(user)).send({ attachmentId: planned.attachment.id }));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}/attachments/{attachmentId}', `${tk}/attachments/${planned.attachment.id}`, (r) => r.set(bearer(user)));
    // Agile tracking: worklogs and dependencies, addressed through the task's project.
    const ag = `${pj}/tasks/${task.id}`;
    const worklog = (
      await traced('post', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/worklogs', `${ag}/worklogs`, (r) => idem(r).send({ durationMinutes: 45 }))
    ).body;
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/worklogs/{worklogId}', `${ag}/worklogs/${worklog.id}`, (r) =>
      r.set(bearer(user)),
    );
    const blocker = (await idem(t.http().post(`${ws}/tasks`)).send({ projectId: project.id, title: 'پیش‌نیاز' })).body as TaskDetail;
    const dependency = (
      await traced('post', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/dependencies', `${ag}/dependencies`, (r) =>
        r.set(bearer(user)).send({ targetTaskId: blocker.id, type: 'blocked_by' }),
      )
    ).body;
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/dependencies/{dependencyId}', `${ag}/dependencies/${dependency.id}`, (r) =>
      r.set(bearer(user)),
    );
    await traced('delete', '/api/v1/workspaces/{workspaceId}/workflow/columns/{columnId}', col, (r) => r.set(bearer(user)).send({}));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/tasks/{taskId}', tk, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/labels/{labelId}', `${ws}/labels/${label.id}`, (r) => r.set(bearer(user)));

    // Notes and the calendar.
    const category = (await traced('post', '/api/v1/workspaces/{workspaceId}/note-categories', `${ws}/note-categories`, (r) => r.set(bearer(user)).send({ label: 'دفتر' }))).body;
    const cat = `${ws}/note-categories/${category.id}`;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/note-categories/{categoryId}', cat, (r) => r.set(bearer(user)).send({ position: 5 }));
    const note = (await traced('post', '/api/v1/workspaces/{workspaceId}/notes', `${ws}/notes`, (r) => idem(r).send({ categoryId: category.id, title: 'یادداشت', body: '- [ ] کار' }))).body;
    const nt = `${ws}/notes/${note.id}`;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/notes/{noteId}', nt, (r) => r.set(bearer(user)).set('If-Match', `"${note.version}"`).send({ pinned: true }));
    await traced('post', '/api/v1/workspaces/{workspaceId}/notes/{noteId}/task', `${nt}/task`, (r) => idem(r).send({ projectId: project.id }));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/notes/{noteId}', nt, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/note-categories/{categoryId}', cat, (r) => r.set(bearer(user)));
    const event = (await traced('post', '/api/v1/workspaces/{workspaceId}/calendar/events', `${ws}/calendar/events`, (r) => idem(r).send({ kind: 'meeting', title: 'جلسه', date: '2030-01-01', startTime: '09:00' }))).body;
    const ev = `${ws}/calendar/events/${event.id}`;
    await traced('patch', '/api/v1/workspaces/{workspaceId}/calendar/events/{eventId}', ev, (r) => r.set(bearer(user)).set('If-Match', `"${event.version}"`).send({ title: 'جلسه ماهانه' }));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/calendar/events/{eventId}', ev, (r) => r.set(bearer(user)));
    await traced('post', '/api/v1/me/notifications/read', '/api/v1/me/notifications/read', (r) => r.set(bearer(user)).send({ all: true }));

    // Chat (M3).
    const cv = '/api/v1/workspaces/{workspaceId}/conversations';
    const conversation = (await traced('post', cv, `${ws}/conversations`, (r) => idem(r).send({ kind: 'group', title: 'ردیابی', memberIds: [] }))).body;
    const cn = `${ws}/conversations/${conversation.id}`;
    await traced('patch', `${cv}/{conversationId}`, cn, (r) => r.set(bearer(user)).send({ topic: 'موضوع' }));
    await traced('put', `${cv}/{conversationId}/members/{userId}`, `${cn}/members/${joiner.userId}`, (r) => r.set(bearer(user)).send({}));
    await traced('put', `${cv}/{conversationId}/me`, `${cn}/me`, (r) => r.set(bearer(user)).send({ pinned: true }));
    const message = (
      await traced('post', `${cv}/{conversationId}/messages`, `${cn}/messages`, (r) => r.set(bearer(user)).send({ clientMsgId: randomUUID(), kind: 'text', text: 'پیام' }))
    ).body;
    const mg = `${cn}/messages/${message.id}`;
    await traced('patch', `${cv}/{conversationId}/messages/{messageId}`, mg, (r) => r.set(bearer(user)).send({ text: 'پیام ویرایش‌شده' }));
    await traced('put', `${cv}/{conversationId}/messages/{messageId}/reactions/{emoji}`, `${mg}/reactions/${encodeURIComponent('👍')}`, (r) => r.set(bearer(user)));
    await traced('delete', `${cv}/{conversationId}/messages/{messageId}/reactions/{emoji}`, `${mg}/reactions/${encodeURIComponent('👍')}`, (r) => r.set(bearer(user)));
    await traced('post', `${cv}/{conversationId}/messages/{messageId}/task`, `${mg}/task`, (r) => idem(r).send({ projectId: project.id, title: 'از پیام' }));
    await traced('post', `${cv}/{conversationId}/read`, `${cn}/read`, (r) => r.set(bearer(user)).send({ seq: 1 }));
    await traced('delete', `${cv}/{conversationId}/messages/{messageId}`, mg, (r) => r.set(bearer(user)));
    // Phase 3.2: scheduled messages (one sent at once, one cancelled) and working hours.
    const sm = '/api/v1/workspaces/{workspaceId}/scheduled-messages';
    const later = new Date(Date.now() + 3600_000).toISOString();
    const scheduleOne = (text: string) =>
      traced('post', `${cv}/{conversationId}/scheduled-messages`, `${cn}/scheduled-messages`, (r) => r.set(bearer(user)).send({ clientMsgId: randomUUID(), kind: 'text', text, scheduledAt: later }));
    const soon = (await scheduleOne('زمان‌بندی‌شده')).body;
    await traced('post', `${sm}/{scheduledId}/send`, `${ws}/scheduled-messages/${soon.id}/send`, (r) => r.set(bearer(user)));
    const dropped = (await scheduleOne('لغوشده')).body;
    await traced('delete', `${sm}/{scheduledId}`, `${ws}/scheduled-messages/${dropped.id}`, (r) => r.set(bearer(user)));
    await traced('put', '/api/v1/workspaces/{workspaceId}/me/working-hours', `${ws}/me/working-hours`, (r) =>
      r.set(bearer(user)).send({ autoReplyEnabled: true, days: ['saturday'], start: '09:00', end: '17:00', message: 'بیرون از ساعت کاری' }),
    );
    await traced('delete', `${cv}/{conversationId}/members/{userId}`, `${cn}/members/${joiner.userId}`, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', pj, (r) => r.set(bearer(user)));
    // Phase 3.1: out of the trash, and back into it.
    await traced('post', '/api/v1/workspaces/{workspaceId}/projects/{projectId}/restore', `${pj}/restore`, (r) => r.set(bearer(user)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}/projects/{projectId}', pj, (r) => r.set(bearer(user)));

    // Platform super admin: ending sessions and a password reset, by a flagged operator.
    const operator = await withAdminPassword(t, await signIn(t, randomPhone(), 'اپراتور پلتفرم'));
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    const target = await signIn(t, randomPhone(), 'کاربر هدف');
    const targetDevice = await signIn(t, target.phone);
    await traced('post', '/api/v1/admin/sessions/{sessionId}/revoke', `/api/v1/admin/sessions/${targetDevice.sessionId}/revoke`, (r) => r.set(bearer(operator)));
    await traced('post', '/api/v1/admin/users/{userId}/sessions/revoke-all', `/api/v1/admin/users/${target.userId}/sessions/revoke-all`, (r) => r.set(bearer(operator)));
    const reset = await traced('post', '/api/v1/admin/users/{userId}/password-reset', `/api/v1/admin/users/${target.userId}/password-reset`, (r) =>
      r.set(bearer(operator)).send({ channel: 'manual' }),
    );
    await traced('post', '/api/v1/password-reset', '/api/v1/password-reset', (r) => r.send({ token: (reset.body as { code: string }).code, newPassword: 'Tazeh-Ramz-1405!' }));
    // Phase 2: moderation.
    await traced('put', '/api/v1/admin/users/{userId}/password-reset-required', `/api/v1/admin/users/${target.userId}/password-reset-required`, (r) =>
      r.set(bearer(operator)).send({ required: true, reason: 'ورود مشکوک' }),
    );
    await traced('post', '/api/v1/admin/users/{userId}/suspend', `/api/v1/admin/users/${target.userId}/suspend`, (r) => r.set(bearer(operator)).send({ reason: 'نقض قوانین' }));
    await traced('post', '/api/v1/admin/users/{userId}/unsuspend', `/api/v1/admin/users/${target.userId}/unsuspend`, (r) => r.set(bearer(operator)).send({}));
    // Phase 3: a workspace of its own, suspended and back, its limits, and its owner replaced.
    const { owner: tenant, workspace: moderated } = await ownerWithWorkspace(t, 'فضای نظارت');
    const heir = await addMember(t, tenant, moderated.id, 'member');
    const wa = `/api/v1/admin/workspaces/${moderated.id}`;
    await traced('post', '/api/v1/admin/workspaces/{workspaceId}/suspend', `${wa}/suspend`, (r) => r.set(bearer(operator)).send({ reason: 'گزارش تخلف' }));
    await traced('post', '/api/v1/admin/workspaces/{workspaceId}/unsuspend', `${wa}/unsuspend`, (r) => r.set(bearer(operator)).send({}));
    await traced('put', '/api/v1/admin/workspaces/{workspaceId}/limits', `${wa}/limits`, (r) =>
      r.set(bearer(operator)).send({ planId: 'team', overrides: { maxProjects: 3 }, reason: 'قرارداد سازمانی' }),
    );
    await traced('post', '/api/v1/admin/workspaces/{workspaceId}/transfer-ownership', `${wa}/transfer-ownership`, (r) =>
      r.set(bearer(operator)).send({ userId: heir.userId, reason: 'مالک در دسترس نیست' }),
    );

    // Phase 4: create, edit and soft-archive a global platform announcement.
    const broadcast = (
      await traced('post', '/api/v1/admin/broadcasts', '/api/v1/admin/broadcasts', (r) =>
        r.set(bearer(operator)).set('Idempotency-Key', idempotencyKey()).send({ message: 'اطلاعیه ردیابی', level: 'info' }),
      )
    ).body as { id: string };
    await traced('patch', '/api/v1/admin/broadcasts/{broadcastId}', `/api/v1/admin/broadcasts/${broadcast.id}`, (r) =>
      r.set(bearer(operator)).send({ message: 'اطلاعیه اصلاح‌شده' }),
    );
    await traced('delete', '/api/v1/admin/broadcasts/{broadcastId}', `/api/v1/admin/broadcasts/${broadcast.id}`, (r) => r.set(bearer(operator)));

    // Phone and password: sign-in, confirming that session with an SMS code, and recovery.
    const keyholder = await withAdminPassword(t, await signIn(t, randomPhone(), 'دارنده رمز'));
    const passwordSession = (
      await traced('post', '/api/v1/auth/password/login', '/api/v1/auth/password/login', (r) => r.send({ phone: localForm(keyholder.phone), password: STRONG_PASSWORD }))
    ).body as AuthSession;
    const clearCooldown = () => t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${keyholder.phone}:cooldown`);
    await clearCooldown();
    const confirmation = await traced('post', '/api/v1/auth/otp/confirm/request', '/api/v1/auth/otp/confirm/request', (r) =>
      r.set('Authorization', `Bearer ${passwordSession.accessToken}`),
    );
    await traced('post', '/api/v1/auth/otp/confirm', '/api/v1/auth/otp/confirm', (r) =>
      r.set('Authorization', `Bearer ${passwordSession.accessToken}`).send({ challengeId: confirmation.body.challengeId, code: lastCode(t, keyholder.phone) }),
    );
    await clearCooldown();
    const recovery = await traced('post', '/api/v1/auth/password/forgot', '/api/v1/auth/password/forgot', (r) => r.send({ phone: localForm(keyholder.phone) }));
    await traced('post', '/api/v1/auth/password/recover', '/api/v1/auth/password/recover', (r) =>
      r.send({ challengeId: recovery.body.challengeId, code: t.sms.lastTo(keyholder.phone)?.tokens.code, newPassword: 'Tazeh-Ramz-1405!' }),
    );

    // Ownership, removal, deletion, and finally signing out.
    await traced('post', '/api/v1/workspaces/{workspaceId}/transfer-ownership', `${ws}/transfer-ownership`, (r) => r.set(bearer(user)).send({ userId: joiner.userId }));
    const newOwner = { ...joiner };
    await traced('delete', '/api/v1/workspaces/{workspaceId}/members/{userId}', `${ws}/members/${user.userId}`, (r) => r.set(bearer(newOwner)));
    await traced('delete', '/api/v1/workspaces/{workspaceId}', ws, (r) => r.set(bearer(newOwner)).send({ confirmName: 'ردیابی' }));
    await traced('post', '/api/v1/auth/logout', '/api/v1/auth/logout', (r) => r.set(bearer(user)).set('Cookie', user.cookies).set('X-CSRF-Token', user.csrf).set('Origin', ORIGIN));

    // Every mutating operation in the API was exercised…
    const document = JSON.parse(await readFile(OPENAPI_FILE, 'utf8')) as { paths: Record<string, Record<string, unknown>> };
    const mutating = Object.entries(document.paths).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((method) => ['post', 'put', 'patch', 'delete'].includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(new Set(calls.map((call) => call.template))).toEqual(new Set(mutating));

    // …and each call left at least one audit row carrying its request id and trace id.
    const { rows } = await t.admin.query<{ request_id: string; trace_id: string; action: string }>(
      'select request_id, trace_id, action from audit_logs where request_id = any($1)',
      [calls.map((call) => call.requestId)],
    );
    for (const call of calls) {
      const audited = rows.filter((row) => row.request_id === call.requestId);
      expect({ route: call.template, audited: audited.length > 0 }).toEqual({ route: call.template, audited: true });
      for (const row of audited) expect({ route: call.template, traceId: row.trace_id }).toEqual({ route: call.template, traceId: call.traceId });
    }
  });

  it('carries the request id and trace id through every log line of a request, and into its jobs', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const requestId = `corr-${randomBytes(6).toString('hex')}`;
    const traceId = randomBytes(16).toString('hex');
    const phone = randomPhone();
    const response = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .set('X-Request-Id', requestId)
      .set('traceparent', `00-${traceId}-${randomBytes(8).toString('hex')}-01`)
      .send({ recipients: [{ address: localForm(phone) }], role: 'member' });
    expect(response.status).toBe(201);
    await t.flushNotifications();

    const lines = t.logs.filter((line) => line.requestId === requestId || (line.req as { id?: string } | undefined)?.id === requestId);
    const completed = lines.find((line) => line.msg === 'request completed');
    expect(completed).toMatchObject({ traceId, userId: owner.userId, workspaceId: workspace.id });
    // The worker's SMS log line belongs to the same request and trace.
    const sent = t.logs.find((line) => line.msg === 'SMS (console driver)' && line.requestId === requestId);
    expect(sent).toMatchObject({ traceId });
    // No line writes a correlation key twice.
    for (const raw of t.rawLogs) {
      for (const key of ['requestId', 'traceId', 'userId', 'workspaceId']) {
        expect({ key, count: raw.split(`"${key}":`).length - 1 <= 1 }).toEqual({ key, count: true });
      }
    }
    // Phone numbers are masked, secrets never appear.
    const serialized = JSON.stringify(t.logs);
    expect(serialized).not.toContain(phone);
    expect(serialized).not.toContain(owner.accessToken);
  });
});

describe('M1 checklist: query budgets (no N+1)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('holds the hot read endpoints to a fixed number of statements, whatever the data size', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const phones = Array.from({ length: 6 }, () => randomPhone());
    await invite(t, owner, workspace.id, phones.map(localForm));
    await t.flushNotifications();
    for (const phone of phones) {
      const member = await signIn(t, phone);
      const link = [...t.sms.sent].reverse().find((sms) => sms.to === phone && sms.template === 'invite')?.tokens.link ?? '';
      await t.http().post('/api/v1/invitations/accept').set(bearer(member)).send({ token: new URL(link).searchParams.get('token') });
    }
    const budget = async (path: string, max: number) => {
      await t.http().get(path).set(bearer(owner)); // warm the permission caches
      const response = await t.http().get(path).set(bearer(owner));
      expect(response.status).toBe(200);
      expect({ path, statements: sqlCount(response) }).toEqual({ path, statements: expect.any(Number) });
      expect(sqlCount(response), path).toBeLessThanOrEqual(max);
    };
    await budget('/api/v1/me', 3);
    await budget(`/api/v1/workspaces/${workspace.id}/members`, 2);
    await budget(`/api/v1/workspaces/${workspace.id}/roles`, 3);
    await budget(`/api/v1/workspaces/${workspace.id}/departments`, 2);
    await budget(`/api/v1/workspaces/${workspace.id}/invitations`, 2);
  });

  it('holds the M2 read models to their budgets: board ≤ 3, task ≤ 2, calendar month ≤ 2, my tasks ≤ 2', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t, 'بودجه');
    await usePlan(t, workspace.id, 'team');
    const member = await addMember(t, owner, workspace.id, 'member');
    const project = await createProject(t, owner, workspace.id);
    const ws = `/api/v1/workspaces/${workspace.id}`;
    const label = (await t.http().post(`${ws}/labels`).set(bearer(owner)).send({ name: 'برچسب' })).body;
    let last: TaskDetail | undefined;
    // Enough cards, each with people, labels, subtasks and comments, to expose any per-row query.
    for (let index = 0; index < 12; index += 1) {
      last = await createTask(t, owner, workspace.id, {
        projectId: project.id,
        title: `کارت ${index}`,
        assigneeIds: [member.userId, owner.userId],
        labelIds: [label.id],
        subtasks: ['یک', 'دو', 'سه'],
        startDate: '2026-11-01',
        dueDate: `2026-11-${String(10 + index).padStart(2, '0')}`,
      });
      await t.http().post(`${ws}/tasks/${last.id}/comments`).set(bearer(owner)).send({ body: 'نظر' });
    }
    for (let index = 0; index < 4; index += 1) {
      await t
        .http()
        .post(`${ws}/calendar/events`)
        .set(bearer(owner))
        .set('Idempotency-Key', idempotencyKey())
        .send({ kind: 'meeting', title: `جلسه ${index}`, date: `2026-11-0${index + 2}`, startTime: '10:00', projectId: project.id, attendeeIds: [member.userId] });
    }
    const budget = async (as: Session, path: string, max: number) => {
      await t.http().get(path).set(bearer(as)); // warm the permission caches
      const response = await t.http().get(path).set(bearer(as));
      expect(response.status, path).toBe(200);
      expect({ path, statements: sqlCount(response) <= max }).toEqual({ path, statements: true });
    };
    for (const as of [owner, member]) {
      await budget(as, `${ws}/board?projectId=${project.id}`, 3);
      await budget(as, `${ws}/tasks/${last?.id}`, 2);
      await budget(as, `${ws}/calendar?from=2026-11-01&to=2026-11-30`, 2);
      await budget(as, `${ws}/tasks?smart=my-tasks`, 2);
      await budget(as, `${ws}/tasks?smart=due-soon`, 2);
      await budget(as, `${ws}/projects`, 2);
    }
  });

  it('holds the M3 chat reads to their budgets: conversation list ≤ 2, history page ≤ 2', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t, 'گفتگوی بودجه');
    await usePlan(t, workspace.id, 'team');
    const member = await addMember(t, owner, workspace.id, 'member');
    const ws = `/api/v1/workspaces/${workspace.id}`;
    let last = '';
    // Several conversations, each with messages, reactions and mentions, to expose any per-row query.
    for (let index = 0; index < 6; index += 1) {
      const conversation = (
        await t.http().post(`${ws}/conversations`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ kind: 'group', title: `گروه ${index}`, memberIds: [member.userId] })
      ).body;
      last = conversation.id;
      for (let message = 0; message < 5; message += 1) {
        const sent = (await t.http().post(`${ws}/conversations/${conversation.id}/messages`).set(bearer(owner)).send({ clientMsgId: randomUUID(), kind: 'text', text: `<@${member.userId}> ${message}` })).body;
        await t.http().put(`${ws}/conversations/${conversation.id}/messages/${sent.id}/reactions/${encodeURIComponent('👍')}`).set(bearer(member));
      }
    }
    for (const as of [owner, member]) {
      for (const path of [`${ws}/conversations`, `${ws}/conversations/${last}/messages`]) {
        await t.http().get(path).set(bearer(as));
        const response = await t.http().get(path).set(bearer(as));
        expect(response.status, path).toBe(200);
        expect({ path, statements: sqlCount(response) <= 2 }).toEqual({ path, statements: true });
      }
    }
  });

  it('reports ready when every dependency answers', async () => {
    const response = await t.http().get('/health/ready');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.info)).toEqual(['database', 'redisCore', 'redisRt', 'storage']);
  });
});
