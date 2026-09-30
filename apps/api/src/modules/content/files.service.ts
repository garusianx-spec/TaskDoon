import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AttachmentView, CompleteUploadBody, CreateUploadBody, FileLink, UploadPlan, UploadView } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { attachments, plans, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { StorageService } from '../../platform/storage/storage.js';
import { messageGrant, publicChannelVisible } from '../chat/chat-access.js';
import { AbilityFactory, projectActions } from '../rbac/ability.js';
import { cleanFileName, isSpoofed, kindOfMime, sniff } from './file-types.js';

type AttachmentRow = typeof attachments.$inferSelect;

/** Up to this size one presigned POST; above it, a multipart upload (RFC §11). */
export const SINGLE_POST_MAX_BYTES = 16 * 1024 * 1024;
/** Part size of multipart uploads (S3's minimum is 5 MiB for all parts but the last). */
export const PART_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 3600;
const DOWNLOAD_TTL_SECONDS = 300;
/** Inline links feed `<img>`, `<audio>` and `<video>`, which may keep reading (seeking) for a while. */
const INLINE_TTL_SECONDS = 900;
const UPLOADS_PER_HOUR = 60;
/** Enough to see a WebM's track list (a voice note is audio-only WebM). */
const SNIFF_BYTES = 4096;
/** Kinds the browser may show in place. Their types were sniffed from the bytes: no SVG, no HTML. */
const INLINE_KINDS = new Set<string>(['image', 'audio', 'video']);

export function attachmentView(row: AttachmentRow): AttachmentView {
  return {
    id: row.id,
    name: row.fileName,
    kind: row.kind,
    mimeType: row.mimeType,
    size: row.sizeBytes,
    status: row.status,
    uploadedById: row.uploaderId,
    uploadedAt: row.createdAt.toISOString(),
  };
}

/**
 * Uploads go straight from the browser to object storage (RFC §11): the API plans the upload,
 * reserves the bytes against the plan's quota so parallel uploads can never overshoot it, and on
 * completion checks the stored object's size and real type before the file becomes usable. No
 * storage call ever runs inside a database transaction.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger('FilesService');

  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly storage: StorageService,
    private readonly redis: RedisClients,
    private readonly abilities: AbilityFactory,
  ) {}

  async createUpload(member: MembershipContext, body: CreateUploadBody): Promise<UploadView> {
    if (!this.abilities.forMember(member).can('create', 'File')) throw ApiError.forbidden();
    await this.hourlyLimit(member.userId);
    const fileName = cleanFileName(body.fileName);
    const contentType = body.contentType.trim().toLowerCase() || 'application/octet-stream';

    const row = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const [plan] = await tx
        .select({ maxFileBytes: sql<number>`(${plans.limits} ->> 'maxFileBytes')::bigint`, storageBytes: sql<number>`(${plans.limits} ->> 'storageBytes')::bigint` })
        .from(workspaces)
        .innerJoin(plans, eq(plans.id, workspaces.planId))
        .where(eq(workspaces.id, member.workspaceId));
      if (!plan) throw ApiError.notFound('The workspace');
      if (body.size > Number(plan.maxFileBytes)) throw new ApiError('PLAN_LIMIT_REACHED', `Files on this plan can be at most ${plan.maxFileBytes} bytes.`);
      // Reserve the bytes in one conditional statement: concurrent uploads cannot both fit.
      const reserved = await tx.execute(sql`
        update workspaces set storage_reserved_bytes = storage_reserved_bytes + ${body.size}
        where id = ${member.workspaceId} and storage_used_bytes + storage_reserved_bytes + ${body.size} <= ${Number(plan.storageBytes)}
        returning id`);
      if (reserved.rows.length === 0) throw new ApiError('PLAN_LIMIT_REACHED', 'The workspace’s storage is full.');
      const id = uuidv7();
      const [created] = await tx
        .insert(attachments)
        .values({
          id,
          workspaceId: member.workspaceId,
          uploaderId: member.userId,
          bucket: this.storage.bucket,
          // Under the workspace's prefix, so a purge deletes it with everything else.
          objectKey: `ws/${member.workspaceId}/att/${id}`,
          fileName,
          mimeType: contentType,
          kind: kindOfMime(contentType, fileName),
          sizeBytes: body.size,
        })
        .returning();
      if (!created) throw new Error('attachment insert returned nothing');
      await this.audit.write(tx, {
        action: 'file.upload.start',
        workspaceId: member.workspaceId,
        resourceType: 'attachment',
        resourceId: created.id,
        changes: { after: { fileName, size: body.size, contentType } },
      });
      return created;
    });

    let plan: UploadPlan;
    try {
      plan = await this.plan(row, contentType);
    } catch (error) {
      await this.release(member, row, 'deleted');
      throw error;
    }
    return { attachment: attachmentView(row), plan, expiresInSeconds: UPLOAD_TTL_SECONDS };
  }

  /**
   * Checks what arrived: the declared size exactly, and bytes that agree with the claimed type.
   * A bad upload is deleted and its reservation released (422). A good one is scanned (the worker
   * marks it ready) and its bytes move from reserved to used.
   */
  async complete(member: MembershipContext, attachmentId: string, body: CompleteUploadBody): Promise<AttachmentView> {
    const row = await this.pending(member, attachmentId);
    const claimed = row.mimeType;
    if (row.multipartUploadId) {
      if (!body.parts?.length) throw ApiError.validation([{ field: 'parts', message: 'a multipart upload needs its parts' }]);
      try {
        await this.storage.completeMultipart(row.objectKey, row.multipartUploadId, body.parts);
      } catch {
        throw new ApiError('UPLOAD_INVALID', 'The parts could not be assembled; upload them again.');
      }
    }
    const stored = await this.storage.head(row.objectKey);
    if (!stored) throw new ApiError('UPLOAD_INVALID', 'Nothing was uploaded yet.');
    let problem: string | null = null;
    let sniffed = null;
    if (stored.size !== row.sizeBytes) {
      problem = `The file is ${stored.size} bytes, not the ${row.sizeBytes} announced.`;
    } else {
      sniffed = sniff(await this.storage.readPrefix(row.objectKey, SNIFF_BYTES), row.fileName);
      if (!sniffed) problem = 'This type of file cannot be uploaded.';
      else if (isSpoofed(claimed, row.fileName, sniffed)) problem = `The file is not a ${claimed} file.`;
    }
    if (problem || !sniffed) {
      await this.storage.delete(row.objectKey).catch(() => undefined);
      await this.release(member, row, 'rejected', problem ?? 'rejected');
      throw new ApiError('UPLOAD_INVALID', problem ?? undefined);
    }

    const accepted = sniffed;
    const updated = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const [done] = await tx
        .update(attachments)
        .set({ status: 'scanning', mimeType: accepted.mime, kind: accepted.kind, multipartUploadId: null })
        .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, attachmentId), eq(attachments.status, 'pending')))
        .returning();
      if (!done) throw new ApiError('CONFLICT', 'The upload was already completed or cancelled.');
      await tx.execute(sql`
        update workspaces set storage_reserved_bytes = greatest(storage_reserved_bytes - ${row.sizeBytes}, 0),
                              storage_used_bytes = storage_used_bytes + ${row.sizeBytes}
        where id = ${member.workspaceId}`);
      await this.audit.write(tx, {
        action: 'file.upload.complete',
        workspaceId: member.workspaceId,
        resourceType: 'attachment',
        resourceId: attachmentId,
        changes: { claimed, sniffed: accepted.mime, size: row.sizeBytes },
      });
      await this.outbox.add(tx, { type: 'file.uploaded', aggregateType: 'attachment', aggregateId: attachmentId, workspaceId: member.workspaceId, payload: { attachmentId } });
      return done;
    });
    return attachmentView(updated);
  }

  async abort(member: MembershipContext, attachmentId: string): Promise<void> {
    const row = await this.pending(member, attachmentId);
    if (row.multipartUploadId) await this.storage.abortMultipart(row.objectKey, row.multipartUploadId).catch(() => undefined);
    await this.storage.delete(row.objectKey).catch(() => undefined);
    await this.release(member, row, 'deleted', 'aborted');
  }

  /** A 5-minute download link (the redirect route). */
  async downloadUrl(member: MembershipContext, attachmentId: string): Promise<string> {
    return (await this.link(member, attachmentId, 'attachment')).url;
  }

  /**
   * A short-lived link to a ready file, for someone who may see it: its uploader, anyone who can
   * see a task it is attached to, and anyone who can read a conversation it was sent in.
   * `inline` (images, audio, video) lets the page show or play it; everything else downloads.
   * Downloads are audited; inline views (thumbnails, playback) are not.
   */
  async link(member: MembershipContext, attachmentId: string, wanted: FileLink['disposition']): Promise<FileLink> {
    if (!this.abilities.forMember(member).can('view', 'File')) throw ApiError.forbidden();
    const row = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const [file] = await tx
        .select()
        .from(attachments)
        .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, attachmentId), sql`${attachments.deletedAt} is null`));
      if (!file || file.status !== 'ready') throw ApiError.notFound('The file');
      const readable =
        file.uploaderId === member.userId || (await this.visibleThroughTask(tx, member, attachmentId)) || (await this.visibleThroughMessage(tx, member, attachmentId));
      if (!readable) throw ApiError.notFound('The file');
      if (wanted === 'attachment' || !INLINE_KINDS.has(file.kind)) {
        await this.audit.write(tx, { action: 'file.download', workspaceId: member.workspaceId, resourceType: 'attachment', resourceId: attachmentId });
      }
      return file;
    });
    const disposition = wanted === 'inline' && INLINE_KINDS.has(row.kind) ? 'inline' : 'attachment';
    const ttl = disposition === 'inline' ? INLINE_TTL_SECONDS : DOWNLOAD_TTL_SECONDS;
    const url = await this.storage.presignGet(row.objectKey, ttl, row.fileName, row.mimeType, disposition);
    return { url, disposition, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  /** Worker: the virus-scan step. The development scanner accepts everything; ClamAV plugs in here. */
  async scan(workspaceId: string, attachmentId: string): Promise<void> {
    await this.uow.run({ workspaceId, userId: null }, async ({ tx }) => {
      await tx
        .update(attachments)
        .set({ status: 'ready', readyAt: sql`now()` })
        .where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.id, attachmentId), eq(attachments.status, 'scanning')));
    });
  }

  /**
   * Worker: uploads never completed within a day are cancelled (their reservation released), and
   * files no task links to after a day are deleted (their bytes freed).
   */
  async collectGarbage(limit = 200): Promise<{ stale: number; unlinked: number }> {
    const due = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.execute<{ workspace_id: string; attachment_id: string; reason: 'stale_upload' | 'unlinked' }>(sql`select * from app.attachments_due_for_gc(${limit})`),
    );
    const counts = { stale: 0, unlinked: 0 };
    for (const entry of due.rows) {
      const row = await this.uow.run({ workspaceId: entry.workspace_id, userId: null }, async ({ tx }) => {
        const [file] = await tx.select().from(attachments).where(and(eq(attachments.workspaceId, entry.workspace_id), eq(attachments.id, entry.attachment_id)));
        return file;
      });
      if (!row) continue;
      if (row.multipartUploadId) await this.storage.abortMultipart(row.objectKey, row.multipartUploadId).catch(() => undefined);
      await this.storage.delete(row.objectKey).catch((error: unknown) => this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'deleting a file failed'));
      await this.uow.run({ workspaceId: entry.workspace_id, userId: null }, async ({ tx }) => {
        const [gone] = await tx
          .update(attachments)
          .set({ status: 'deleted', deletedAt: sql`now()` })
          .where(and(eq(attachments.workspaceId, entry.workspace_id), eq(attachments.id, entry.attachment_id), sql`${attachments.deletedAt} is null`))
          .returning({ status: attachments.status });
        if (!gone) return;
        await tx.execute(
          entry.reason === 'stale_upload'
            ? sql`update workspaces set storage_reserved_bytes = greatest(storage_reserved_bytes - ${row.sizeBytes}, 0) where id = ${entry.workspace_id}`
            : row.status === 'rejected'
              ? sql`select 1`
              : sql`update workspaces set storage_used_bytes = greatest(storage_used_bytes - ${row.sizeBytes}, 0) where id = ${entry.workspace_id}`,
        );
        await this.audit.write(tx, { action: 'file.gc', workspaceId: entry.workspace_id, actorUserId: null, resourceType: 'attachment', resourceId: entry.attachment_id, changes: { reason: entry.reason } });
      });
      counts[entry.reason === 'stale_upload' ? 'stale' : 'unlinked'] += 1;
    }
    return counts;
  }

  /* ------------------------------------------------------------------ helpers */

  private async plan(row: AttachmentRow, contentType: string): Promise<UploadPlan> {
    if (row.sizeBytes <= SINGLE_POST_MAX_BYTES) {
      // Exactly the announced size, exactly the announced type: the store refuses anything else.
      const post = await this.storage.presignPost(row.objectKey, {
        minBytes: row.sizeBytes,
        maxBytes: row.sizeBytes,
        contentTypePrefix: contentType,
        expiresInSeconds: UPLOAD_TTL_SECONDS,
      });
      return { kind: 'post', url: post.url, fields: post.fields };
    }
    const uploadId = await this.storage.createMultipart(row.objectKey, contentType);
    await this.uow.run({ workspaceId: row.workspaceId, userId: row.uploaderId }, ({ tx }) =>
      tx.update(attachments).set({ multipartUploadId: uploadId }).where(and(eq(attachments.workspaceId, row.workspaceId), eq(attachments.id, row.id))),
    );
    const count = Math.ceil(row.sizeBytes / PART_BYTES);
    const parts = await Promise.all(
      Array.from({ length: count }, async (_, index) => ({
        partNumber: index + 1,
        url: await this.storage.presignPart(row.objectKey, uploadId, index + 1, UPLOAD_TTL_SECONDS),
      })),
    );
    return { kind: 'multipart', partSize: PART_BYTES, parts };
  }

  /** The caller's own pending upload, or 404. */
  private async pending(member: MembershipContext, attachmentId: string): Promise<AttachmentRow> {
    const [row] = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx
        .select()
        .from(attachments)
        .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, attachmentId), eq(attachments.uploaderId, member.userId))),
    );
    if (!row) throw ApiError.notFound('The upload');
    if (row.status !== 'pending') throw new ApiError('CONFLICT', 'The upload was already completed or cancelled.');
    return row;
  }

  /** Ends a pending upload without keeping it, releasing its reservation. */
  private async release(member: MembershipContext, row: AttachmentRow, status: 'deleted' | 'rejected', reason: string = status): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const [ended] = await tx
        .update(attachments)
        .set({ status, ...(status === 'deleted' ? { deletedAt: sql`now()` } : {}) })
        .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, row.id), eq(attachments.status, 'pending')))
        .returning({ id: attachments.id });
      if (!ended) return;
      await tx.execute(sql`update workspaces set storage_reserved_bytes = greatest(storage_reserved_bytes - ${row.sizeBytes}, 0) where id = ${member.workspaceId}`);
      await this.audit.write(tx, {
        action: status === 'rejected' ? 'file.upload.reject' : 'file.upload.abort',
        workspaceId: member.workspaceId,
        resourceType: 'attachment',
        resourceId: row.id,
        changes: { reason },
      });
    });
  }

  /** Sent in a live message of a conversation the caller can read (a member, or a public channel). */
  private async visibleThroughMessage(tx: Tx, member: MembershipContext, attachmentId: string): Promise<boolean> {
    if (!messageGrant(member, 'view')) return false;
    const result = await tx.execute<{ kind: string; is_private: boolean; is_member: boolean }>(sql`
      select c.kind, c.is_private,
             exists (select 1 from conversation_members cm
                     where cm.workspace_id = m.workspace_id and cm.conversation_id = m.conversation_id
                       and cm.user_id = ${member.userId} and cm.left_at is null) as is_member
      from messages m
      join conversations c on c.workspace_id = m.workspace_id and c.id = m.conversation_id
      where m.workspace_id = ${member.workspaceId} and m.attachment_id = ${attachmentId} and m.deleted_at is null`);
    return result.rows.some((row) => row.is_member || (row.kind === 'channel' && !row.is_private && publicChannelVisible(member)));
  }

  private async visibleThroughTask(tx: Tx, member: MembershipContext, attachmentId: string): Promise<boolean> {
    const result = await tx.execute<{ visibility: 'workspace' | 'private'; role: 'lead' | 'contributor' | 'viewer' | null }>(sql`
      select p.visibility, (select pm.role from project_members pm where pm.project_id = p.id and pm.user_id = ${member.userId}) as role
      from task_attachments ta
      join tasks t on t.workspace_id = ta.workspace_id and t.id = ta.task_id and t.deleted_at is null
      join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id and p.deleted_at is null
      where ta.workspace_id = ${member.workspaceId} and ta.attachment_id = ${attachmentId}`);
    return result.rows.some((row) => projectActions(member, { visibility: row.visibility, role: row.role }).includes('view'));
  }

  /** 60 upload plans per user per hour (RFC §5). Fails open: a Redis outage must not stop work. */
  private async hourlyLimit(userId: string): Promise<void> {
    const key = this.redis.key('rl', 'upload', userId);
    let count = 0;
    let ttl = 3600;
    try {
      const results = await this.redis.core.multi().incr(key).expire(key, 3600, 'NX').ttl(key).exec();
      count = Number(results?.[0]?.[1] ?? 0);
      ttl = Number(results?.[2]?.[1] ?? 3600);
    } catch {
      return;
    }
    if (count > UPLOADS_PER_HOUR) throw ApiError.rateLimited(ttl > 0 ? ttl : 3600, 'Too many uploads this hour.');
  }
}
