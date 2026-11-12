import { SessionService } from '../../src/modules/auth/session.service.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { UnitOfWork } from '../../src/platform/db/unit-of-work.js';
import type { Session, TestApp } from './harness.js';

/**
 * Models a password-only session retained from before conditional admin sign-in. New public
 * sign-ins cannot create this session; the privileged-route guards must still reject it.
 */
export async function legacyPasswordSession(t: TestApp, account: Session): Promise<Session> {
  const { session } = await t.app
    .get(UnitOfWork)
    .run({ workspaceId: null, userId: account.userId }, (unit) =>
      t.app
        .get(SessionService)
        .create(unit, account.userId, { deviceLabel: 'legacy password-only fixture' }, ['pwd']),
    );
  const { rows } = await t.admin.query<{ security_version: number }>(
    'select security_version from users where id = $1',
    [account.userId],
  );
  const version = rows[0]?.security_version;
  if (version === undefined) throw new Error('legacy session fixture account missing');
  const access = await t.app.get(TokenService).signAccess({
    userId: account.userId,
    sessionId: session.id,
    amr: ['pwd'],
    authTime: Math.floor(session.createdAt.getTime() / 1000),
    securityVersion: version,
    stepUpAt: null,
  });
  return { ...account, accessToken: access.token, sessionId: session.id, cookies: '', csrf: '' };
}
