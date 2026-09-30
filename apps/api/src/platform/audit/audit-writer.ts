import { Injectable } from '@nestjs/common';
import { RequestContext } from '../context/request-context.js';
import type { Tx } from '../db/database.js';
import { auditLogs } from '../db/schema/all.js';
import { maskPhone } from '../logging/logging.js';

export interface AuditEntry {
  /** Dotted verb, e.g. `workspace.create`, `member.role.change`, `auth.session.revoke`. */
  readonly action: string;
  readonly workspaceId?: string | null;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly changes?: Readonly<Record<string, unknown>>;
  /** Defaults to the signed-in user of the current request. */
  readonly actorUserId?: string | null;
}

const SECRET_KEYS = /(password|token|secret|code|otp|hash)/i;
const PHONE_KEYS = /phone|address/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Deep-copies `value`, dropping secrets and masking phone numbers and email local parts. */
export function redactChanges(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => redactChanges(item, key));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactChanges(v, k)]));
  }
  if (typeof value === 'string') {
    if (E164.test(value)) return maskPhone(value);
    if (/email/i.test(key) || (PHONE_KEYS.test(key) && value.includes('@'))) {
      const [local = '', domain = ''] = value.split('@');
      return `${local.slice(0, 1)}***@${domain}`;
    }
  }
  return value;
}

/**
 * Appends to the audit trail inside the caller's transaction, so an audited change and its audit
 * row commit or roll back together. Actor, session, IP, user agent, request id and trace id come
 * from the request context.
 */
@Injectable()
export class AuditWriter {
  constructor(private readonly context: RequestContext) {}

  async write(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLogs).values(this.row(entry));
  }

  /** For security events that must be recorded even though the request itself fails. */
  row(entry: AuditEntry): typeof auditLogs.$inferInsert {
    return {
      workspaceId: entry.workspaceId ?? null,
      actorUserId: entry.actorUserId === undefined ? (this.context.userId ?? null) : entry.actorUserId,
      actorSessionId: this.context.sessionId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      changes: entry.changes ? (redactChanges(entry.changes) as Record<string, unknown>) : null,
      ip: this.context.ip ?? null,
      userAgent: this.context.userAgent?.slice(0, 512) ?? null,
      requestId: this.context.requestId ?? null,
      traceId: this.context.traceId ?? null,
    };
  }
}
