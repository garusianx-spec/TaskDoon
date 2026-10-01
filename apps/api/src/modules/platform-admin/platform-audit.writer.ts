import { Injectable } from '@nestjs/common';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { platformAuditLogs } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';

export interface PlatformAuditEntry {
  /** Dotted verb: `admin.messages.read`, `admin.session.revoke` … */
  readonly action: string;
  /** The person whose data this was. */
  readonly targetUserId?: string | null;
  readonly resourceType?: string;
  readonly resourceId?: string;
  /** Filters and counts; never message content, codes or passwords. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Writes what a platform admin looked at or did: a `platform_audit_logs` row (admin, target,
 * action, the client IP as the trusted proxy reports it, user agent, request id) and the
 * matching `audit_logs` row, in one transaction. Reads are recorded after the data is loaded and
 * before it is returned: an inspection that cannot be recorded is not served.
 */
@Injectable()
export class PlatformAuditWriter {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly context: RequestContext,
  ) {}

  async record(admin: PlatformAdmin, entry: PlatformAuditEntry, unit?: Unit): Promise<void> {
    if (unit) return this.write(unit, admin, entry);
    await this.uow.run({ workspaceId: null, userId: admin.userId }, (own) => this.write(own, admin, entry));
  }

  private async write(unit: Unit, admin: PlatformAdmin, entry: PlatformAuditEntry): Promise<void> {
    await unit.tx.insert(platformAuditLogs).values({
      adminId: admin.userId,
      targetUserId: entry.targetUserId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      ip: this.context.ip ?? null,
      userAgent: this.context.userAgent?.slice(0, 512) ?? null,
      requestId: this.context.requestId ?? null,
      traceId: this.context.traceId ?? null,
      metadata: entry.metadata ? { ...entry.metadata } : null,
    });
    await this.audit.write(unit.tx, {
      action: `platform.${entry.action}`,
      workspaceId: null,
      actorUserId: admin.userId,
      ...(entry.resourceType ? { resourceType: entry.resourceType } : {}),
      ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
      changes: { after: { targetUserId: entry.targetUserId ?? null, ...(entry.metadata ?? {}) } },
    });
  }
}
