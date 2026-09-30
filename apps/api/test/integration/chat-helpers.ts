import { randomUUID } from 'node:crypto';
import type { ConversationDetail, CreateConversationBody, MessagePage, SendMessageBody, SentMessage } from '@taskin/contracts';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { bearer, idempotencyKey, type Session, type TestApp } from './harness.js';
import { expectStatus, wsPath } from './work-helpers.js';

export async function createConversation(t: TestApp, as: Session, workspaceId: string, body: CreateConversationBody, status = 201): Promise<ConversationDetail> {
  const response = await t.http().post(`${wsPath(workspaceId)}/conversations`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send(body);
  expectStatus(response, status);
  return response.body as ConversationDetail;
}

/** Sends over the HTTP fallback; returns the ack. */
export async function sendRest(
  t: TestApp,
  as: Session,
  workspaceId: string,
  conversationId: string,
  body: Partial<SendMessageBody> & { text?: string },
  status = 201,
): Promise<SentMessage> {
  const response = await t
    .http()
    .post(`${wsPath(workspaceId)}/conversations/${conversationId}/messages`)
    .set(bearer(as))
    .send({ clientMsgId: randomUUID(), kind: 'text', ...body });
  expectStatus(response, status);
  return response.body as SentMessage;
}

export async function history(t: TestApp, as: Session, workspaceId: string, conversationId: string, query = ''): Promise<MessagePage> {
  const response = await t.http().get(`${wsPath(workspaceId)}/conversations/${conversationId}/messages${query ? `?${query}` : ''}`).set(bearer(as));
  expectStatus(response, 200);
  return response.body as MessagePage;
}

export interface SeededMember {
  readonly userId: string;
  readonly sessionId: string;
  readonly accessToken: string;
}

/**
 * `count` new members of the workspace (role `member`), inserted directly and signed in with a
 * token from the app's own key: load and scale tests need many people, not the sign-up flow.
 */
export async function seedMembers(t: TestApp, workspaceId: string, count: number): Promise<SeededMember[]> {
  const base = Math.floor(Math.random() * 9_000_000);
  const { rows } = await t.admin.query<{ id: string }>(
    `insert into users (phone, phone_verified_at, full_name)
     select '+98936' || lpad(((${base} + g) % 10000000)::text, 7, '0'), now(), 'همکار ' || g from generate_series(1, $1) g
     returning id`,
    [count],
  );
  await t.admin.query(
    `insert into workspace_members (workspace_id, user_id, role_id)
     select $1, u, (select id from roles where workspace_id = $1 and key = 'member') from unnest($2::uuid[]) u`,
    [workspaceId, rows.map((row) => row.id)],
  );
  const tokens = t.app.get(TokenService);
  return Promise.all(
    rows.map(async ({ id }) => {
      const sessionId = randomUUID();
      const { token } = await tokens.signAccess({ userId: id, sessionId, amr: ['otp'], authTime: Math.floor(Date.now() / 1000), securityVersion: 1, stepUpAt: null });
      return { userId: id, sessionId, accessToken: token };
    }),
  );
}
