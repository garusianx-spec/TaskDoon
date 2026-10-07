import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { CreateBroadcastBody, SystemBroadcastEvent, SystemBroadcastPage, SystemBroadcastView, UpdateBroadcastBody } from '@taskin/contracts';
import { Clock } from '../../platform/clock/clock.js';
import type { Tx } from '../../platform/db/database.js';
import { systemBroadcasts, users } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import type { BroadcastQueryDto } from '../broadcasts/broadcasts.dto.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import { decodeCursor, encodeCursor } from './admin-queries.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';

type BroadcastRow = typeof systemBroadcasts.$inferSelect;

function view(row: BroadcastRow, createdByName: string): SystemBroadcastView {
  return {
    id: row.id, message: row.message, level: row.level, isActive: row.isActive,
    startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null, createdByName,
  };
}

function validWindow(startsAt: Date, expiresAt: Date | null): void {
  if (!Number.isFinite(startsAt.getTime()) || (expiresAt !== null && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt))) {
    throw ApiError.validation([{ field: 'expiresAt', message: 'must be later than startsAt' }]);
  }
}

/** Reads use the isolated admin pool; writes, audit and outbox use the regular transactional pool. */
@Injectable()
export class PlatformBroadcastsService {
  constructor(
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly broadcasts: BroadcastsService,
    private readonly clock: Clock,
  ) {}

  async list(admin: PlatformAdmin, query: BroadcastQueryDto): Promise<SystemBroadcastPage> {
    const limit = query.limit ?? 50;
    const cursor = decodeCursor(query.cursor);
    const status = query.status ?? 'current';
    return this.admins.read(admin, async (tx) => {
      const rows = await tx.select({ broadcast: systemBroadcasts, createdByName: users.fullName })
        .from(systemBroadcasts).innerJoin(users, eq(users.id, systemBroadcasts.createdBy))
        .where(and(
          status === 'current' ? isNull(systemBroadcasts.archivedAt) : status === 'archived' ? isNotNull(systemBroadcasts.archivedAt) : undefined,
          cursor ? or(lt(systemBroadcasts.createdAt, new Date(cursor.createdAt)), and(eq(systemBroadcasts.createdAt, new Date(cursor.createdAt)), lt(systemBroadcasts.id, cursor.id))) : undefined,
        )).orderBy(desc(systemBroadcasts.createdAt), desc(systemBroadcasts.id)).limit(limit + 1);
      const items = rows.slice(0, limit).map((row) => view(row.broadcast, row.createdByName));
      const last = items.at(-1);
      return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
    });
  }

  async create(admin: PlatformAdmin, body: CreateBroadcastBody): Promise<SystemBroadcastView> {
    const startsAt = body.startsAt === undefined ? this.clock.now() : new Date(body.startsAt);
    const expiresAt = body.expiresAt == null ? null : new Date(body.expiresAt);
    validWindow(startsAt, expiresAt);
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const [row] = await unit.tx.insert(systemBroadcasts).values({
        message: body.message.trim(), level: body.level, startsAt, expiresAt,
        isActive: body.isActive ?? true, createdBy: admin.userId, updatedBy: admin.userId,
      }).returning();
      if (!row) throw new Error('Broadcast insert returned no row');
      await this.record(unit, admin, row, 'admin.broadcast.create', row.isActive ? 'published' : 'withdrawn', Object.keys(body));
      return view(row, admin.fullName);
    });
  }

  async update(admin: PlatformAdmin, id: string, body: UpdateBroadcastBody): Promise<SystemBroadcastView> {
    if (Object.keys(body).length === 0) throw ApiError.validation([{ field: 'body', message: 'must change at least one field' }]);
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const existing = await this.lock(unit.tx, id);
      if (existing.archivedAt !== null) throw new ApiError('CONFLICT', 'Archived broadcasts cannot be edited.');
      const startsAt = body.startsAt === undefined ? existing.startsAt : new Date(body.startsAt);
      const expiresAt = body.expiresAt === undefined ? existing.expiresAt : body.expiresAt === null ? null : new Date(body.expiresAt);
      validWindow(startsAt, expiresAt);
      const [row] = await unit.tx.update(systemBroadcasts).set({
        ...(body.message !== undefined ? { message: body.message.trim() } : {}),
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        startsAt, expiresAt, updatedBy: admin.userId,
      }).where(eq(systemBroadcasts.id, id)).returning();
      if (!row) throw ApiError.notFound('Broadcast');
      const onlyToggle = Object.keys(body).length === 1 && body.isActive !== undefined;
      const action = onlyToggle ? row.isActive ? 'admin.broadcast.activate' : 'admin.broadcast.deactivate' : 'admin.broadcast.update';
      await this.record(unit, admin, row, action, !row.isActive ? 'withdrawn' : !existing.isActive ? 'published' : 'updated', Object.keys(body));
      const [creator] = await unit.tx.select({ name: users.fullName }).from(users).where(eq(users.id, row.createdBy));
      return view(row, creator?.name ?? '');
    });
  }

  async archive(admin: PlatformAdmin, id: string): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const existing = await this.lock(unit.tx, id);
      if (existing.archivedAt !== null) return;
      const [row] = await unit.tx.update(systemBroadcasts).set({
        archivedAt: this.clock.now(), isActive: false, updatedBy: admin.userId,
      }).where(eq(systemBroadcasts.id, id)).returning();
      if (!row) throw ApiError.notFound('Broadcast');
      await this.record(unit, admin, row, 'admin.broadcast.archive', 'withdrawn', ['archivedAt', 'isActive']);
    });
  }

  private async lock(tx: Tx, id: string): Promise<BroadcastRow> {
    const [row] = await tx.select().from(systemBroadcasts).where(eq(systemBroadcasts.id, id)).for('update');
    if (!row) throw ApiError.notFound('Broadcast');
    return row;
  }

  private async record(unit: Unit, admin: PlatformAdmin, row: BroadcastRow, action: string, eventAction: SystemBroadcastEvent['action'], fields: readonly string[]): Promise<void> {
    await this.audit.record(admin, {
      action, resourceType: 'broadcast', resourceId: row.id,
      metadata: { fields, level: row.level, isActive: row.isActive, startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null },
    }, unit);
    await this.outbox.add(unit.tx, { type: 'system.broadcast', aggregateType: 'broadcast', aggregateId: row.id, workspaceId: null, payload: { broadcastId: row.id, action: eventAction } });
    unit.afterCommit(() => this.broadcasts.afterChange());
  }
}