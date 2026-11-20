import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type {
  SupportAgentView,
  SupportAttachment,
  SupportUploadView,
  TicketMessageView,
  TicketPage,
  TicketThread,
  TicketView,
  FileLink,
} from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import {
  supportMessages,
  supportTickets,
  supportUploads,
  users,
  workspaceMembers,
  workspaces,
} from '../../platform/db/schema/all.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock } from '../../platform/clock/clock.js';
import { StorageService } from '../../platform/storage/storage.js';
import { PlatformAdminUnitOfWork } from '../platform-admin/admin-unit-of-work.js';
import { PlatformAuditWriter } from '../platform-admin/platform-audit.writer.js';
import type { PlatformAdmin } from '../platform-admin/platform-admin.guard.js';
import { decodeCursor, encodeCursor, likeContains } from '../platform-admin/admin-queries.js';
import { cleanFileName, isSpoofed, sniff } from '../content/file-types.js';
import { replyStatus, supportCommandHash, transitionAllowed } from './support.policy.js';
import type {
  AgentReplyDto,
  AgentTicketQueryDto,
  CreateTicketDto,
  SupportReplyDto,
  SupportUploadDto,
  TicketQueryDto,
  UpdateTicketDto,
} from './support.dto.js';

type Ticket = typeof supportTickets.$inferSelect;
type Message = typeof supportMessages.$inferSelect;
type Upload = typeof supportUploads.$inferSelect;
export interface SupportActor {
  userId: string;
  admin?: PlatformAdmin;
}
const SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
const agentWhere = and(
  eq(users.isPlatformAdmin, true),
  eq(users.status, 'active'),
  eq(users.platformAdminStatus, 'ACTIVE'),
  isNull(users.deletedAt),
);
const replyHash = (body: SupportReplyDto, internal = false) =>
  supportCommandHash({ body: body.body, internal, files: [...(body.attachmentIds ?? [])].sort() });

@Injectable()
export class SupportService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly audit: AuditWriter,
    private readonly platformAudit: PlatformAuditWriter,
    private readonly clock: Clock,
    private readonly storage: StorageService,
  ) {}

  private run<T>(actor: SupportActor, work: (unit: Unit) => Promise<T>) {
    return this.uow.run({ workspaceId: null, userId: actor.userId }, work);
  }
  private async ticket(tx: Tx, actor: SupportActor, id: string, lock = false): Promise<Ticket> {
    const q = tx
      .select()
      .from(supportTickets)
      .where(
        and(eq(supportTickets.id, id), actor.admin ? undefined : eq(supportTickets.userId, actor.userId)),
      );
    const [row] = lock ? await q.for('update') : await q;
    if (!row) throw ApiError.notFound('Ticket');
    return row;
  }
  private async creationWorkspace(tx: Tx, userId: string, workspaceId: string): Promise<string> {
    const [w] = await tx
      .select({ name: workspaces.name })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'active'),
        ),
      )
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)));
    if (!w) throw ApiError.forbidden('An active membership is required');
    return w.name;
  }
  private async record(unit: Unit, actor: SupportActor, ticket: Ticket, action: string): Promise<void> {
    if (actor.admin)
      await this.platformAudit.record(
        actor.admin,
        {
          action: `admin.${action}`,
          resourceType: 'support_ticket',
          resourceId: ticket.id,
          targetUserId: ticket.userId,
        },
        unit,
      );
    else
      await this.audit.write(unit.tx, {
        action,
        actorUserId: actor.userId,
        resourceType: 'support_ticket',
        resourceId: ticket.id,
      });
  }
  private view(t: Ticket, unreadCount: number, admin = false): TicketView {
    return {
      id: t.id,
      reference: `TICK-${t.referenceNumber}`,
      subject: t.subject,
      department: t.department,
      priority: t.priority,
      status: t.status,
      userId: t.userId,
      workspaceId: t.workspaceId,
      workspaceName: t.workspaceName,
      version: t.version,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      unreadCount,
      ...(admin ? { assignedAdminId: t.assignedAdminId } : {}),
    };
  }
  private unread(actor: SupportActor) {
    // Keep outer correlation explicitly qualified: Drizzle unqualifies column objects in a single-table selection.
    return sql<number>`(select count(*)::int from support_messages sm where sm.ticket_id = support_tickets.id and not sm.is_internal
      and sm.sender_type = ${actor.admin ? 'USER' : 'AGENT'} and sm.public_seq > ${actor.admin ? sql`support_tickets.agent_read_seq` : sql`support_tickets.user_read_seq`})`.mapWith(
      Number,
    );
  }
  async list(actor: SupportActor, q: TicketQueryDto | AgentTicketQueryDto): Promise<TicketPage> {
    const work = async (tx: Tx): Promise<TicketPage> => {
      const cursor = decodeCursor(q.cursor);
      const limit = q.limit ?? 30;
      const adminQ = q as AgentTicketQueryDto;
      const rows = await tx
        .select({ ticket: supportTickets, unread: this.unread(actor) })
        .from(supportTickets)
        .where(
          and(
            actor.admin ? undefined : eq(supportTickets.userId, actor.userId),
            q.status ? eq(supportTickets.status, q.status) : undefined,
            q.priority ? eq(supportTickets.priority, q.priority) : undefined,
            q.department ? eq(supportTickets.department, q.department) : undefined,
            q.q
              ? sql`(${supportTickets.subject} ilike ${likeContains(q.q)} or ('TICK-' || ${supportTickets.referenceNumber}::text) ilike ${likeContains(q.q)})`
              : undefined,
            actor.admin && adminQ.assignedAdminId
              ? eq(supportTickets.assignedAdminId, adminQ.assignedAdminId)
              : undefined,
            actor.admin && adminQ.unassigned === 'true' ? isNull(supportTickets.assignedAdminId) : undefined,
            cursor
              ? or(
                  lt(supportTickets.updatedAt, new Date(cursor.createdAt)),
                  and(
                    eq(supportTickets.updatedAt, new Date(cursor.createdAt)),
                    lt(supportTickets.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
        .limit(limit + 1);
      const selected = rows.slice(0, limit);
      const last = selected.at(-1)?.ticket;
      return {
        items: selected.map((r) => this.view(r.ticket, r.unread, !!actor.admin)),
        nextCursor: rows.length > limit && last ? encodeCursor(last.updatedAt.toISOString(), last.id) : null,
      };
    };
    const result = actor.admin
      ? await this.admins.read(actor.admin, work)
      : await this.run(actor, (u) => work(u.tx));
    if (actor.admin)
      await this.platformAudit.record(actor.admin, {
        action: 'admin.support.list',
        resourceType: 'support_ticket',
        metadata: { count: result.items.length },
      });
    return result;
  }
  private fileView(f: Upload, admin: boolean): SupportAttachment {
    return {
      id: f.id,
      name: f.fileName,
      size: f.sizeBytes,
      mimeType: f.mimeType,
      url: `/api/v1/${admin ? 'admin' : 'support'}/tickets/${f.ticketId}/attachments/${f.id}`,
    };
  }
  private async messages(
    tx: Tx,
    actor: SupportActor,
    id: string,
    cursor?: string,
  ): Promise<{ messages: TicketMessageView[]; nextCursor: string | null }> {
    const before = decodeCursor(cursor);
    const rows = await tx
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.ticketId, id),
          actor.admin ? undefined : eq(supportMessages.isInternal, false),
          before
            ? or(
                lt(supportMessages.createdAt, new Date(before.createdAt)),
                and(
                  eq(supportMessages.createdAt, new Date(before.createdAt)),
                  lt(supportMessages.id, before.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(supportMessages.createdAt), desc(supportMessages.id))
      .limit(51);
    const selected = rows.slice(0, 50);
    const last = selected.at(-1);
    const files = selected.length
      ? await tx
          .select()
          .from(supportUploads)
          .where(
            and(
              inArray(
                supportUploads.messageId,
                selected.map((m) => m.id),
              ),
              eq(supportUploads.status, 'ready'),
            ),
          )
          .limit(250)
      : [];
    return {
      messages: selected.reverse().map((m) => ({
        id: m.id,
        ticketId: m.ticketId,
        senderId: m.senderId,
        senderType: m.senderType,
        isInternal: m.isInternal,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        publicSeq: m.publicSeq,
        attachments: files.filter((f) => f.messageId === m.id).map((f) => this.fileView(f, !!actor.admin)),
      })),
      nextCursor: rows.length > 50 && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
    };
  }
  async thread(actor: SupportActor, id: string, cursor?: string): Promise<TicketThread> {
    const work = async (tx: Tx) => {
      const t = await this.ticket(tx, actor, id);
      const [counts] = await tx
        .select({ n: this.unread(actor) })
        .from(supportTickets)
        .where(eq(supportTickets.id, id));
      return {
        ticket: this.view(t, counts?.n ?? 0, !!actor.admin),
        ...(await this.messages(tx, actor, id, cursor)),
      };
    };
    const result = actor.admin
      ? await this.admins.read(actor.admin, work)
      : await this.run(actor, (u) => work(u.tx));
    if (actor.admin)
      await this.platformAudit.record(actor.admin, {
        action: 'admin.support.read',
        resourceType: 'support_ticket',
        resourceId: id,
        targetUserId: result.ticket.userId,
      });
    return result;
  }
  private async attach(
    tx: Tx,
    actor: SupportActor,
    t: Ticket,
    message: Message,
    ids: string[],
  ): Promise<void> {
    if (!ids.length) return;
    const rows = await tx.select().from(supportUploads).where(inArray(supportUploads.id, ids)).for('update');
    if (
      rows.length !== ids.length ||
      rows.some(
        (f) =>
          f.uploaderId !== actor.userId ||
          f.status !== 'ready' ||
          f.messageId !== null ||
          f.senderType !== (actor.admin ? 'AGENT' : 'USER') ||
          (f.ticketId !== null && f.ticketId !== t.id) ||
          (f.ticketId === null && f.workspaceId !== t.workspaceId),
      )
    )
      throw ApiError.validation([
        { field: 'attachmentIds', message: 'A file is unavailable or belongs to another request' },
      ]);
    await tx
      .update(supportUploads)
      .set({ ticketId: t.id, messageId: message.id })
      .where(inArray(supportUploads.id, ids));
  }
  async create(userId: string, body: CreateTicketDto): Promise<TicketView> {
    const actor = { userId };
    const hash = supportCommandHash({
      workspaceId: body.workspaceId,
      subject: body.subject,
      department: body.department,
      priority: body.priority,
      body: body.body,
      files: [...(body.attachmentIds ?? [])].sort(),
    });
    return this.uow.run({ workspaceId: body.workspaceId, userId }, async (unit) => {
      await unit.tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [prior] = await unit.tx
        .select()
        .from(supportTickets)
        .where(and(eq(supportTickets.userId, userId), eq(supportTickets.commandId, body.commandId)));
      if (prior) {
        if (prior.commandHash !== hash) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
        return this.view(prior, 0);
      }
      const name = await this.creationWorkspace(unit.tx, userId, body.workspaceId);
      const [recent] = await unit.tx
        .select({ n: count() })
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.userId, userId),
            gt(supportTickets.createdAt, new Date(this.clock.now().getTime() - 86400000)),
          ),
        );
      if ((recent?.n ?? 0) >= 20) throw ApiError.rateLimited(3600, 'Too many new support requests');
      const [t] = await unit.tx
        .insert(supportTickets)
        .values({
          userId,
          workspaceId: body.workspaceId,
          workspaceName: name,
          subject: body.subject,
          department: body.department,
          priority: body.priority,
          commandId: body.commandId,
          commandHash: hash,
        })
        .returning();
      if (!t) throw new Error('Ticket insert returned no row');
      const [m] = await unit.tx
        .insert(supportMessages)
        .values({
          ticketId: t.id,
          senderId: userId,
          senderType: 'USER',
          body: body.body,
          publicSeq: 1,
          commandId: body.commandId,
          commandHash: replyHash(body),
        })
        .returning();
      if (!m) throw new Error('Message insert returned no row');
      await this.attach(unit.tx, actor, t, m, body.attachmentIds ?? []);
      await this.record(unit, actor, t, 'support.create');
      return this.view(t, 0);
    });
  }
  async reply(
    actor: SupportActor,
    id: string,
    body: SupportReplyDto | AgentReplyDto,
  ): Promise<TicketMessageView> {
    const internal = !!actor.admin && !!(body as AgentReplyDto).isInternal;
    const hash = replyHash(body, internal);
    const message = await this.run(actor, async (unit) => {
      const t = await this.ticket(unit.tx, actor, id, true);
      const [prior] = await unit.tx
        .select()
        .from(supportMessages)
        .where(
          and(
            eq(supportMessages.ticketId, id),
            eq(supportMessages.senderId, actor.userId),
            eq(supportMessages.commandId, body.commandId),
          ),
        );
      if (prior) {
        if (prior.commandHash !== hash) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
        return prior;
      }
      const status = replyStatus(t.status, !!actor.admin, internal);
      if (!status) throw new ApiError('CONFLICT', 'The ticket is closed');
      const seq = internal ? null : t.lastPublicSeq + 1;
      const [m] = await unit.tx
        .insert(supportMessages)
        .values({
          ticketId: id,
          senderId: actor.userId,
          senderType: actor.admin ? 'AGENT' : 'USER',
          body: body.body,
          isInternal: internal,
          publicSeq: seq,
          commandId: body.commandId,
          commandHash: hash,
          createdAt: this.clock.now(),
        })
        .returning();
      if (!m) throw new Error('Message insert returned no row');
      await this.attach(unit.tx, actor, t, m, body.attachmentIds ?? []);
      if (!internal)
        await unit.tx
          .update(supportTickets)
          .set({ status, lastPublicSeq: seq!, updatedAt: this.clock.now(), version: t.version + 1 })
          .where(eq(supportTickets.id, id));
      await this.record(unit, actor, t, internal ? 'support.note' : 'support.reply');
      return m;
    });
    // Return exactly the committed message, without exposing any other internal material.
    const files = await this.run(actor, ({ tx }) =>
      tx.select().from(supportUploads).where(eq(supportUploads.messageId, message.id)).limit(5),
    );
    return {
      id: message.id,
      ticketId: id,
      senderId: message.senderId,
      senderType: message.senderType,
      isInternal: message.isInternal,
      body: message.body,
      publicSeq: message.publicSeq,
      createdAt: message.createdAt.toISOString(),
      attachments: files.map((f) => this.fileView(f, !!actor.admin)),
    };
  }
  async read(actor: SupportActor, id: string, throughSeq: number): Promise<void> {
    await this.run(actor, async ({ tx }) => {
      const t = await this.ticket(tx, actor, id, true);
      if (throughSeq > t.lastPublicSeq)
        throw ApiError.validation([{ field: 'throughSeq', message: 'Cannot read future messages' }]);
      await tx
        .update(supportTickets)
        .set(
          actor.admin
            ? { agentReadSeq: Math.max(t.agentReadSeq, throughSeq) }
            : { userReadSeq: Math.max(t.userReadSeq, throughSeq) },
        )
        .where(eq(supportTickets.id, id));
    });
  }
  async update(actor: SupportActor, id: string, body: UpdateTicketDto): Promise<TicketView> {
    return this.run(actor, async (unit) => {
      const t = await this.ticket(unit.tx, actor, id, true);
      if (!actor.admin && t.status === 'CLOSED') return this.view(t, 0);
      if (body.expectedVersion !== t.version) throw new ApiError('PRECONDITION_FAILED');
      const status = actor.admin ? (body.status ?? t.status) : 'CLOSED';
      if (!transitionAllowed(t.status, status))
        throw new ApiError('CONFLICT', 'Reopen a closed ticket before changing its resolution');
      if (actor.admin && body.assignedAdminId) {
        const [agent] = await unit.tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, body.assignedAdminId), agentWhere));
        if (!agent)
          throw ApiError.validation([
            { field: 'assignedAdminId', message: 'An active support agent is required' },
          ]);
      }
      const [changed] = await unit.tx
        .update(supportTickets)
        .set({
          status,
          updatedAt: this.clock.now(),
          version: t.version + 1,
          ...(actor.admin && body.priority ? { priority: body.priority } : {}),
          ...(actor.admin && body.assignedAdminId !== undefined
            ? { assignedAdminId: body.assignedAdminId }
            : {}),
        })
        .where(eq(supportTickets.id, id))
        .returning();
      if (!changed) throw new Error('Ticket update returned no row');
      await this.record(unit, actor, t, 'support.update');
      return this.view(changed, 0, !!actor.admin);
    });
  }
  async agents(admin: PlatformAdmin): Promise<SupportAgentView[]> {
    const agents = await this.admins.read(admin, (tx) =>
      tx
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(agentWhere)
        .orderBy(users.fullName, users.id)
        .limit(100),
    );
    await this.platformAudit.record(admin, {
      action: 'admin.support.agents',
      resourceType: 'support_ticket',
      metadata: { count: agents.length },
    });
    return agents;
  }
  private uploadKey(row: Upload): string {
    return `support/${row.uploaderId}/${row.id}`;
  }
  private async uploadView(row: Upload, plan = false): Promise<SupportUploadView> {
    return {
      id: row.id,
      name: row.fileName,
      size: row.sizeBytes,
      mimeType: row.mimeType,
      status: row.status,
      ...(plan && row.status === 'pending'
        ? {
            plan: {
              kind: 'post' as const,
              ...(await this.storage.presignPost(`${this.uploadKey(row)}/pending`, {
                minBytes: row.sizeBytes,
                maxBytes: row.sizeBytes,
                contentTypePrefix: row.mimeType,
                expiresInSeconds: 300,
              })),
            },
          }
        : {}),
    };
  }
  async planUpload(
    actor: SupportActor,
    body: SupportUploadDto,
    scope: { ticketId?: string; workspaceId?: string },
  ): Promise<SupportUploadView> {
    const row = await this.uow.run(
      { workspaceId: scope.workspaceId ?? null, userId: actor.userId },
      async ({ tx }) => {
        const ticket = scope.ticketId ? await this.ticket(tx, actor, scope.ticketId) : null;
        if (!ticket) {
          if (actor.admin || !scope.workspaceId) throw ApiError.forbidden();
          await this.creationWorkspace(tx, actor.userId, scope.workspaceId);
        }
        await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.userId)).for('update');
        const name = cleanFileName(body.fileName);
        const workspaceId = ticket?.workspaceId ?? scope.workspaceId ?? null;
        const hash = supportCommandHash({
          name,
          size: body.size,
          type: body.contentType,
          ticketId: scope.ticketId ?? null,
          workspaceId,
          senderType: actor.admin ? 'AGENT' : 'USER',
        });
        const [prior] = await tx
          .select()
          .from(supportUploads)
          .where(
            and(eq(supportUploads.uploaderId, actor.userId), eq(supportUploads.commandId, body.commandId)),
          );
        if (prior) {
          if (prior.commandHash !== hash) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
          if (prior.status === 'pending' && prior.expiresAt <= this.clock.now())
            throw new ApiError('UPLOAD_INVALID', 'Upload reservation expired');
          return prior;
        }
        const [recent] = await tx
          .select({ n: count() })
          .from(supportUploads)
          .where(
            and(
              eq(supportUploads.uploaderId, actor.userId),
              gt(supportUploads.createdAt, new Date(this.clock.now().getTime() - 3600000)),
            ),
          );
        if ((recent?.n ?? 0) >= 30) throw ApiError.rateLimited(3600, 'Too many support uploads');
        const [total] = await tx
          .select({ bytes: sql<number>`coalesce(sum(${supportUploads.sizeBytes}),0)`.mapWith(Number) })
          .from(supportUploads)
          .where(eq(supportUploads.uploaderId, actor.userId));
        if ((total?.bytes ?? 0) + body.size > 1024 * 1024 * 1024)
          throw ApiError.validation([{ field: 'file', message: 'SUPPORT_QUOTA' }]);
        const [created] = await tx
          .insert(supportUploads)
          .values({
            uploaderId: actor.userId,
            workspaceId,
            ticketId: scope.ticketId ?? null,
            senderType: actor.admin ? 'AGENT' : 'USER',
            fileName: name,
            mimeType: body.contentType,
            sizeBytes: body.size,
            commandId: body.commandId,
            commandHash: hash,
            expiresAt: new Date(this.clock.now().getTime() + 900000),
          })
          .returning();
        if (!created) throw new Error('Upload insert returned no row');
        return created;
      },
    );
    return this.uploadView(row, true);
  }
  async completeUpload(actor: SupportActor, id: string, ticketId?: string): Promise<SupportUploadView> {
    const row = await this.run(actor, async ({ tx }) => {
      if (ticketId) await this.ticket(tx, actor, ticketId);
      const [f] = await tx
        .select()
        .from(supportUploads)
        .where(
          and(
            eq(supportUploads.id, id),
            eq(supportUploads.uploaderId, actor.userId),
            eq(supportUploads.senderType, actor.admin ? 'AGENT' : 'USER'),
            ticketId ? eq(supportUploads.ticketId, ticketId) : isNull(supportUploads.ticketId),
          ),
        );
      if (!f) throw ApiError.notFound('Upload');
      return f;
    });
    if (row.status === 'ready') return this.uploadView(row);
    if (row.status === 'rejected' || row.expiresAt <= this.clock.now())
      throw new ApiError('UPLOAD_INVALID', 'Upload is no longer available');
    const updated = await this.run(actor, async ({ tx }) => {
      const [f] = await tx.select().from(supportUploads).where(eq(supportUploads.id, id)).for('update');
      if (!f || f.uploaderId !== actor.userId) throw ApiError.notFound('Upload');
      if (f.status === 'ready') return f;
      if (f.status !== 'pending' || f.expiresAt <= this.clock.now()) throw new ApiError('UPLOAD_INVALID');
      // Publish a private immutable copy. A still-valid POST capability can only overwrite /pending.
      const signal = AbortSignal.timeout(10000);
      const key = this.uploadKey(f);
      const pending = await this.storage.head(`${key}/pending`, signal);
      let detected = null;
      if (pending?.size === f.sizeBytes) {
        await this.storage.copy(`${key}/pending`, key, f.mimeType, signal);
        detected = sniff(await this.storage.readPrefix(key, 4096, signal), f.fileName);
      }
      const valid =
        !!detected && SAFE_TYPES.has(detected.mime) && !isSpoofed(f.mimeType, f.fileName, detected);
      const [changed] = await tx
        .update(supportUploads)
        .set({
          status: valid ? 'ready' : 'rejected',
          ...(valid && detected ? { mimeType: detected.mime } : {}),
        })
        .where(eq(supportUploads.id, id))
        .returning();
      if (!changed) throw new Error('Upload update returned no row');
      return changed;
    });
    if (updated.status !== 'ready')
      throw new ApiError('UPLOAD_INVALID', 'The size or type of the file did not match');
    return this.uploadView(updated);
  }
  async fileLink(actor: SupportActor, ticketId: string, fileId: string): Promise<FileLink> {
    const row = await this.run(actor, async (unit) => {
      const t = await this.ticket(unit.tx, actor, ticketId);
      const [file] = await unit.tx
        .select({ file: supportUploads })
        .from(supportUploads)
        .innerJoin(supportMessages, eq(supportMessages.id, supportUploads.messageId))
        .where(
          and(
            eq(supportUploads.id, fileId),
            eq(supportUploads.ticketId, ticketId),
            eq(supportUploads.status, 'ready'),
            actor.admin ? undefined : eq(supportMessages.isInternal, false),
          ),
        );
      if (!file) throw ApiError.notFound('Attachment');
      await this.record(unit, actor, t, 'support.file.download');
      return file.file;
    });
    return {
      url: await this.storage.presignGet(this.uploadKey(row), 60, row.fileName, row.mimeType, 'attachment'),
      expiresAt: new Date(this.clock.now().getTime() + 60000).toISOString(),
      disposition: 'attachment',
    };
  }
}
