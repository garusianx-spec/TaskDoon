import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { PublishedSiteDocument, SiteContent, SiteAuditEntry, SiteDocument, SiteDocumentKind, SiteMedia, SiteRedirect, SiteRevision, SiteSubmission } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { AppConfig } from '../../config/app-config.js';
import type { Tx } from '../../platform/db/database.js';
import { siteAuditLogs, siteDocuments, siteMedia, siteRedirects, siteRevisions, siteSubmissions } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { StorageService } from '../../platform/storage/storage.js';
import type { PlatformAdmin } from '../platform-admin/platform-admin.guard.js';
import { parseKind, validateInboxUpdate, validateMediaInput, validateMediaUpdate, validateRedirect, validateRevision, validateSiteDocument, validateSitePublish, validateSubmission } from './site.validation.js';

type DocumentRow = typeof siteDocuments.$inferSelect;
type MediaRow = typeof siteMedia.$inferSelect;
const scope = (admin?: PlatformAdmin) => ({ workspaceId: null, userId: admin?.userId ?? null });
const documentView = (row: DocumentRow): SiteDocument => ({ id: row.id, kind: row.kind, slug: row.slug, title: row.draft.title, status: row.status, draft: row.draft, published: row.published, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null });
const mediaView = (row: MediaRow): SiteMedia => ({ id: row.id, src: `/api/v1/public/site/media/${row.id}`, alt: row.alt, filename: row.filename, contentType: row.contentType, size: row.size, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null });
const pathOf = (kind: SiteDocumentKind, slug: string) => kind === 'page' ? (slug === 'home' ? '/' : `/${slug}`) : kind === 'feature' ? `/features/${slug}` : kind === 'article' ? `/blog/${slug}` : kind === 'help' ? `/help/${slug}` : kind === 'job' ? `/careers/${slug}` : null;
type PublicRow = { id: string; kind: SiteDocumentKind; slug: string; content: SiteContent; published_at: Date; updated_at: Date; version: number };

@Injectable()
export class SiteService {
  constructor(private readonly uow: UnitOfWork, private readonly redis: RedisClients, private readonly storage: StorageService, private readonly config: AppConfig, private readonly sharedAudit: AuditWriter) {}

  async publicDocuments(kind?: string, slug?: string): Promise<PublishedSiteDocument[]> {
    const parsed = parseKind(kind);
    const result = await this.uow.run(scope(), ({ tx }) => tx.execute<PublicRow>(sql`select * from app.published_site_documents(${parsed ?? null}::text, ${slug ?? null}::text)`));
    return result.rows.map((row) => ({ ...row.content, id: row.id, kind: row.kind, slug: row.slug, publishedAt: new Date(row.published_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), version: row.version }));
  }

  async publicDocument(kind: string, slug: string): Promise<PublishedSiteDocument> {
    const [document] = await this.publicDocuments(kind, slug);
    if (!document) throw ApiError.notFound('The published page');
    return document;
  }

  async singleton(kind: 'settings' | 'navigation'): Promise<PublishedSiteDocument> {
    const [document] = await this.publicDocuments(kind);
    if (!document) throw ApiError.notFound('The published site configuration');
    return document;
  }

  async list(admin: PlatformAdmin, kind?: string, q?: string): Promise<SiteDocument[]> {
    const parsed = parseKind(kind);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const rows = await tx.select().from(siteDocuments).where(and(parsed ? eq(siteDocuments.kind, parsed) : undefined, q ? or(ilike(siteDocuments.slug, `%${q.slice(0, 100)}%`), sql`${siteDocuments.draft}->>'title' ilike ${`%${q.slice(0, 100)}%`}`) : undefined)).orderBy(desc(siteDocuments.updatedAt)).limit(500);
      await this.audit(tx, admin, 'site.documents.read');
      return rows.map(documentView);
    });
  }

  async detail(admin: PlatformAdmin, id: string, preview = false): Promise<SiteDocument> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const row = await this.get(tx, id);
      await this.audit(tx, admin, preview ? 'site.document.preview' : 'site.document.read', id);
      return documentView(row);
    });
  }

  async create(admin: PlatformAdmin, body: unknown): Promise<SiteDocument> {
    const input = validateSiteDocument(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const [row] = await tx.insert(siteDocuments).values({ kind: input.kind, slug: input.slug, draft: input.draft, createdBy: admin.userId, updatedBy: admin.userId }).returning();
      if (!row) throw new ApiError('INTERNAL');
      await this.revision(tx, admin, row, 'create');
      return documentView(row);
    });
  }

  async save(admin: PlatformAdmin, id: string, body: unknown): Promise<SiteDocument> {
    const input = validateSiteDocument(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const previous = await this.get(tx, id, true);
      if (previous.kind === 'page' && previous.slug === 'home' && input.slug !== 'home') throw ApiError.validation([{ field: 'slug', message: 'the homepage must retain its home key' }]);
      if (input.kind !== previous.kind) throw ApiError.validation([{ field: 'kind', message: 'the document kind cannot change' }]);
      if (input.version !== undefined && input.version !== previous.version) throw ApiError.stale(documentView(previous));
      const [row] = await tx.update(siteDocuments).set({ slug: input.slug, draft: input.draft, updatedAt: new Date(), updatedBy: admin.userId, version: previous.version + 1 }).where(eq(siteDocuments.id, id)).returning();
      if (!row) throw ApiError.notFound();
      await this.revision(tx, admin, row, 'save');
      return documentView(row);
    });
  }

  async transition(admin: PlatformAdmin, id: string, action: 'publish' | 'unpublish' | 'archive'): Promise<SiteDocument> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const previous = await this.get(tx, id, true);
      const now = new Date();
      const version = previous.version + 1;
      if (action === 'publish') {
        validateSitePublish(previous.kind, previous.slug, previous.draft);
        await this.validateReferences(tx, previous);
        const fromPath = previous.publishedSlug ? pathOf(previous.kind, previous.publishedSlug) : null;
        const toPath = pathOf(previous.kind, previous.slug);
        if (toPath) await tx.delete(siteRedirects).where(eq(siteRedirects.fromPath, toPath));
        if (fromPath && toPath && fromPath !== toPath) await tx.insert(siteRedirects).values({ fromPath, toPath }).onConflictDoUpdate({ target: siteRedirects.fromPath, set: { toPath } });
      }
      const [row] = await tx.update(siteDocuments).set({
        status: action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'draft',
        ...(action === 'publish' ? { published: previous.draft, publishedSlug: previous.slug, publishedVersion: version, publishedAt: previous.publishedAt ?? now, publishedUpdatedAt: now } : {}),
        version, updatedAt: now, updatedBy: admin.userId,
      }).where(eq(siteDocuments.id, id)).returning();
      if (!row) throw ApiError.notFound();
      await this.revision(tx, admin, row, action);
      return documentView(row);
    });
  }

  async revisions(admin: PlatformAdmin, id: string): Promise<SiteRevision[]> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      await this.get(tx, id);
      const rows = await tx.select().from(siteRevisions).where(eq(siteRevisions.documentId, id)).orderBy(desc(siteRevisions.createdAt)).limit(100);
      await this.audit(tx, admin, 'site.revisions.read', id);
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }

  async restore(admin: PlatformAdmin, id: string, body: unknown): Promise<SiteDocument> {
    const { revisionId } = validateRevision(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const previous = await this.get(tx, id, true);
      const [revision] = await tx.select().from(siteRevisions).where(and(eq(siteRevisions.id, revisionId), eq(siteRevisions.documentId, id)));
      if (!revision) throw ApiError.notFound('The revision');
      const [row] = await tx.update(siteDocuments).set({ draft: revision.content, slug: revision.slug, version: previous.version + 1, updatedBy: admin.userId, updatedAt: new Date() }).where(eq(siteDocuments.id, id)).returning();
      if (!row) throw ApiError.notFound();
      await this.revision(tx, admin, row, 'restore');
      return documentView(row);
    });
  }

  async submit(body: unknown, ip: string, origin?: string): Promise<{ id: string; received: true }> {
    if (origin && !this.config.allowedOrigins.includes(origin)) throw new ApiError('CSRF_FAILED');
    const input = validateSubmission(body);
    const key = this.redis.key('site', 'submissions', createHash('sha256').update(ip).digest('hex').slice(0, 32));
    const attempts = await this.redis.core.incr(key);
    if (attempts === 1) await this.redis.core.expire(key, 900);
    if (attempts > 5) throw ApiError.rateLimited(900, 'Please wait before sending another request.');
    if (input.kind === 'application' && !(await this.publicDocuments('job')).some((job) => job.id === input.jobId)) throw ApiError.validation([{ field: 'jobId', message: 'the job opening is not available' }]);
    const id = randomUUID();
    await this.uow.run(scope(), async ({ tx }) => {
      const { website: _website, ...payload } = input;
      await tx.insert(siteSubmissions).values({ id, kind: input.kind, payload });
      await this.sharedAudit.write(tx, { action: 'site.submission.create', resourceType: 'site-submission', resourceId: id, actorUserId: null, changes: { kind: input.kind } });
    });
    return { id, received: true };
  }

  async submissions(admin: PlatformAdmin, query: { kind?: string; status?: string; q?: string; page?: string; limit?: string }): Promise<{ items: SiteSubmission[]; total: number; page: number; limit: number }> {
    const page = Math.floor(Math.max(1, Math.min(100000, Number(query.page) || 1)));
    const limit = Math.floor(Math.max(1, Math.min(100, Number(query.limit) || 25)));
    const filter = and(query.kind ? eq(siteSubmissions.kind, query.kind) : undefined, query.status ? eq(siteSubmissions.status, query.status) : undefined, query.q ? sql`${siteSubmissions.payload}::text ilike ${`%${query.q.slice(0, 100)}%`}` : undefined);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const rows = await tx.select().from(siteSubmissions).where(filter).orderBy(desc(siteSubmissions.createdAt)).limit(limit).offset((page - 1) * limit);
      const [total] = await tx.select({ value: count() }).from(siteSubmissions).where(filter);
      await this.audit(tx, admin, 'site.submissions.read');
      return { items: rows.map((row) => this.submissionView(row)), total: total?.value ?? 0, page, limit };
    });
  }

  async submission(admin: PlatformAdmin, id: string): Promise<SiteSubmission> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const [row] = await tx.select().from(siteSubmissions).where(eq(siteSubmissions.id, id));
      if (!row) throw ApiError.notFound();
      await this.audit(tx, admin, 'site.submission.read');
      return this.submissionView(row);
    });
  }

  async updateSubmission(admin: PlatformAdmin, id: string, body: unknown): Promise<SiteSubmission> {
    const update = validateInboxUpdate(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const [row] = await tx.update(siteSubmissions).set({ ...update, updatedAt: new Date() }).where(eq(siteSubmissions.id, id)).returning();
      if (!row) throw ApiError.notFound();
      await this.audit(tx, admin, 'site.submission.update');
      return this.submissionView(row);
    });
  }

  async redirects(admin?: PlatformAdmin, fromPath?: string): Promise<SiteRedirect[] | SiteRedirect | null> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const rows = await tx.select().from(siteRedirects).where(fromPath ? eq(siteRedirects.fromPath, fromPath) : undefined).orderBy(desc(siteRedirects.createdAt)).limit(500);
      return fromPath ? (rows[0] ? { ...rows[0], createdAt: rows[0].createdAt.toISOString() } : null) : rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }

  async addRedirect(admin: PlatformAdmin, body: unknown): Promise<SiteRedirect> {
    const input = validateRedirect(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      const docs = await tx.select({ kind: siteDocuments.kind, slug: siteDocuments.publishedSlug }).from(siteDocuments).where(eq(siteDocuments.status, 'published'));
      if (docs.some((row) => row.slug && pathOf(row.kind, row.slug) === input.fromPath)) throw new ApiError('CONFLICT', 'A published page already uses this path.');
      let next = input.toPath;
      const visited = new Set([input.fromPath]);
      for (let step = 0; step < 20; step += 1) {
        if (visited.has(next)) throw ApiError.validation([{ field: 'toPath', message: 'redirects must not form a loop' }]);
        visited.add(next);
        const [redirect] = await tx.select().from(siteRedirects).where(eq(siteRedirects.fromPath, next));
        if (!redirect) break;
        next = redirect.toPath;
        if (step === 19) throw ApiError.validation([{ field: 'toPath', message: 'redirect chain is too long' }]);
      }
      const [row] = await tx.insert(siteRedirects).values(input).onConflictDoUpdate({ target: siteRedirects.fromPath, set: { toPath: input.toPath } }).returning();
      if (!row) throw new ApiError('INTERNAL');
      await this.audit(tx, admin, 'site.redirect.save');
      return { ...row, createdAt: row.createdAt.toISOString() };
    });
  }

  async deleteRedirect(admin: PlatformAdmin, id: string): Promise<void> {
    await this.uow.run(scope(admin), async ({ tx }) => { await tx.delete(siteRedirects).where(eq(siteRedirects.id, id)); await this.audit(tx, admin, 'site.redirect.delete'); });
  }

  async activity(admin: PlatformAdmin): Promise<SiteAuditEntry[]> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const rows = await tx.select().from(siteAuditLogs).orderBy(desc(siteAuditLogs.createdAt)).limit(200);
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }

  async mediaList(admin: PlatformAdmin, q?: string): Promise<SiteMedia[]> {
    return this.uow.run(scope(admin), async ({ tx }) => {
      const rows = await tx.select().from(siteMedia).where(and(isNotNull(siteMedia.completedAt), q ? or(ilike(siteMedia.filename, `%${q.slice(0, 100)}%`), ilike(siteMedia.alt, `%${q.slice(0, 100)}%`)) : undefined)).orderBy(desc(siteMedia.createdAt)).limit(500);
      return rows.map(mediaView);
    });
  }

  async mediaUpload(admin: PlatformAdmin, body: unknown): Promise<{ media: SiteMedia; upload: { url: string; fields: Record<string, string> } }> {
    const input = validateMediaInput(body);
    const id = randomUUID();
    const storageKey = `site-media-pending/${id}/upload`;
    const row = await this.uow.run(scope(admin), async ({ tx }) => {
      const [row] = await tx.insert(siteMedia).values({ id, storageKey, ...input, createdBy: admin.userId }).returning();
      if (!row) throw new ApiError('INTERNAL');
      await this.audit(tx, admin, 'site.media.upload');
      return row;
    });
    return { media: mediaView(row), upload: await this.storage.presignPost(storageKey, { minBytes: input.size, maxBytes: input.size, contentTypePrefix: input.contentType, expiresInSeconds: 300 }) };
  }

  async mediaComplete(admin: PlatformAdmin, id: string): Promise<SiteMedia> {
    const row = await this.uow.run(scope(admin), async ({ tx }) => { const [row] = await tx.select().from(siteMedia).where(eq(siteMedia.id, id)); if (!row) throw ApiError.notFound(); return row; });
    if (row.completedAt) {
      await this.uow.run(scope(admin), ({ tx }) => this.audit(tx, admin, 'site.media.complete'));
      return mediaView(row);
    }
    const head = await this.storage.head(row.storageKey);
    const prefix = head ? await this.storage.readPrefix(row.storageKey, 32) : Buffer.alloc(0);
    const mime = prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 ? 'image/jpeg' : ['GIF87a', 'GIF89a'].includes(prefix.subarray(0, 6).toString()) ? 'image/gif' : prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!head || head.size !== row.size || head.contentType !== row.contentType || mime !== row.contentType) {
      await this.storage.delete(row.storageKey);
      throw new ApiError('UPLOAD_INVALID', 'The image size or file signature does not match its declaration.');
    }
    const finalKey = `site-media/${id}/original`;
    await this.storage.copy(row.storageKey, finalKey, row.contentType);
    const completedMedia = await this.uow.run(scope(admin), async ({ tx }) => {
      const [completed] = await tx.update(siteMedia).set({ completedAt: new Date(), storageKey: finalKey }).where(eq(siteMedia.id, id)).returning();
      if (!completed) throw ApiError.notFound();
      await this.audit(tx, admin, 'site.media.complete');
      return mediaView(completed);
    });
    await this.storage.delete(row.storageKey);
    return completedMedia;
  }

  async updateMedia(admin: PlatformAdmin, id: string, body: unknown): Promise<SiteMedia> {
    const input = validateMediaUpdate(body);
    return this.uow.run(scope(admin), async ({ tx }) => {
      if (input.archive) {
        const [reference] = await tx.select({ id: siteDocuments.id }).from(siteDocuments).where(and(eq(siteDocuments.status, 'published'), sql`${siteDocuments.published}::text like ${`%/api/v1/public/site/media/${id}%`}`)).limit(1);
        if (reference) throw new ApiError('CONFLICT', 'This image is referenced by published content. Remove the reference and publish first.');
      }
      const [row] = await tx.update(siteMedia).set({ ...(input.alt !== undefined ? { alt: input.alt } : {}), ...(input.archive !== undefined ? { archivedAt: input.archive ? new Date() : null } : {}) }).where(eq(siteMedia.id, id)).returning();
      if (!row) throw ApiError.notFound();
      await this.audit(tx, admin, input.archive ? 'site.media.archive' : 'site.media.update');
      return mediaView(row);
    });
  }

  async publicMedia(id: string): Promise<string> {
    const row = await this.uow.run(scope(), async ({ tx }) => { const [row] = await tx.select().from(siteMedia).where(and(eq(siteMedia.id, id), isNotNull(siteMedia.completedAt), isNull(siteMedia.archivedAt))); return row; });
    if (!row) throw ApiError.notFound('The image');
    return this.storage.presignGet(row.storageKey, 300, row.filename, row.contentType, 'inline');
  }

  private async validateReferences(tx: Tx, document: DocumentRow): Promise<void> {
    const seen = new Set([document.id]);
    const walk = async (content: SiteContent, depth: number): Promise<void> => {
      if (depth > 8) throw ApiError.validation([{ field: 'draft.sections', message: 'reusable block nesting exceeds 8 levels' }]);
      for (const block of content.sections.filter((block) => block.visible)) {
        for (const image of [block.media, ...(block.items ?? []).map((item) => item.media)]) {
          const match = image?.src.match(/\/api\/v1\/public\/site\/media\/([0-9a-f-]{36})$/i);
          if (match?.[1]) {
            const [media] = await tx.select({ id: siteMedia.id }).from(siteMedia).where(and(eq(siteMedia.id, match[1]), isNotNull(siteMedia.completedAt), isNull(siteMedia.archivedAt)));
            if (!media) throw ApiError.validation([{ field: 'draft.sections.media', message: 'only completed, active media may be published' }]);
          }
        }
        if (block.type === 'reusable') {
          if (!block.referenceId || seen.has(block.referenceId)) throw ApiError.validation([{ field: 'draft.sections.referenceId', message: 'a published reusable block is required and must not create a cycle' }]);
          const [reference] = await tx.select().from(siteDocuments).where(and(eq(siteDocuments.id, block.referenceId), eq(siteDocuments.kind, 'reusable'), eq(siteDocuments.status, 'published')));
          if (!reference?.published) throw ApiError.validation([{ field: 'draft.sections.referenceId', message: 'the reusable block must be published first' }]);
          seen.add(reference.id); await walk(reference.published, depth + 1); seen.delete(reference.id);
        }
      }
    };
    await walk(document.draft, 0);
  }

  private async get(tx: Tx, id: string, lock = false): Promise<DocumentRow> {
    const query = tx.select().from(siteDocuments).where(eq(siteDocuments.id, id));
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw ApiError.notFound('The document');
    return row;
  }
  private async audit(tx: Tx, admin: PlatformAdmin, action: string, documentId?: string): Promise<void> {
    await tx.insert(siteAuditLogs).values({ actorId: admin.userId, action, documentId: documentId ?? null });
    await this.sharedAudit.write(tx, { action, actorUserId: admin.userId, resourceType: 'site-document', ...(documentId ? { resourceId: documentId } : {}) });
  }
  private async revision(tx: Tx, admin: PlatformAdmin, row: DocumentRow, action: string): Promise<void> {
    await tx.insert(siteRevisions).values({ documentId: row.id, content: row.draft, slug: row.slug, version: row.version, actorId: admin.userId, action });
    await this.audit(tx, admin, `site.document.${action}`, row.id);
  }
  private submissionView(row: typeof siteSubmissions.$inferSelect): SiteSubmission {
    return { ...row.payload, id: row.id, status: row.status as SiteSubmission['status'], notes: row.notes, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
