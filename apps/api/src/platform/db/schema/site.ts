import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { SiteContent, SiteDocumentKind, SiteStatus, SiteSubmissionInput } from '@taskin/contracts';
import { createdAt, instant, updatedAt, uuidPk } from './columns.js';
import { users } from './identity.js';

/** Editorial data is platform-scoped, never related to workspace entitlements or attachments. */
export const siteDocuments = pgTable('site_documents', {
  id: uuidPk(), kind: text().$type<SiteDocumentKind>().notNull(), slug: text().notNull(),
  status: text().$type<SiteStatus>().notNull().default('draft'), draft: jsonb().$type<SiteContent>().notNull(),
  published: jsonb().$type<SiteContent>(), publishedSlug: text(), version: integer().notNull().default(1),
  publishedVersion: integer(), createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }), createdAt: createdAt(), updatedAt: updatedAt(),
  publishedAt: instant(), publishedUpdatedAt: instant(),
}, (t) => [uniqueIndex('site_documents_kind_slug_uq').on(t.kind, t.slug), uniqueIndex('site_documents_public_slug_uq').on(t.kind, t.publishedSlug), index('site_documents_status_kind_idx').on(t.status, t.kind), check('site_documents_kind_check', sql`${t.kind} in ('page','feature','article','help','faq','pricing','job','settings','navigation','reusable')`), check('site_documents_status_check', sql`${t.status} in ('draft','published','archived')`), check('site_documents_version_check', sql`${t.version} > 0`), check('site_documents_public_snapshot_check', sql`(${t.published} is null) = (${t.publishedSlug} is null)`), check('site_documents_published_check', sql`${t.status} <> 'published' or ${t.published} is not null`)]);

export const siteRevisions = pgTable('site_revisions', {
  id: uuidPk(), documentId: uuid().notNull().references(() => siteDocuments.id, { onDelete: 'restrict' }),
  content: jsonb().$type<SiteContent>().notNull(), slug: text().notNull(), version: integer().notNull(),
  actorId: uuid().references(() => users.id, { onDelete: 'set null' }), action: text().notNull(), createdAt: createdAt(),
}, (t) => [index('site_revisions_document_idx').on(t.documentId, t.createdAt.desc())]);

export const siteSubmissions = pgTable('site_submissions', {
  id: uuidPk(), kind: text().notNull(), payload: jsonb().$type<SiteSubmissionInput>().notNull(),
  status: text().notNull().default('new'), notes: text().notNull().default(''), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('site_submissions_inbox_idx').on(t.kind, t.status, t.createdAt.desc()), check('site_submissions_kind_check', sql`${t.kind} in ('contact','collaboration','demo','application')`), check('site_submissions_status_check', sql`${t.status} in ('new','in-progress','closed','archived')`)]);

export const siteRedirects = pgTable('site_redirects', {
  id: uuidPk(), fromPath: text().notNull(), toPath: text().notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex('site_redirects_path_uq').on(t.fromPath), check('site_redirects_check', sql`${t.fromPath} <> ${t.toPath}`)]);

export const siteAuditLogs = pgTable('site_audit_log', {
  id: uuidPk(), actorId: uuid().references(() => users.id, { onDelete: 'set null' }), action: text().notNull(),
  documentId: uuid().references(() => siteDocuments.id, { onDelete: 'restrict' }), createdAt: createdAt(),
}, (t) => [index('site_audit_created_idx').on(t.createdAt.desc())]);

export const siteMedia = pgTable('site_media', {
  id: uuidPk(), storageKey: text().notNull(), filename: text().notNull(), contentType: text().notNull(),
  size: integer().notNull(), alt: text().notNull(), createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(), completedAt: instant(), archivedAt: instant(),
}, (t) => [check('site_media_size_check', sql`${t.size} > 0 and ${t.size} <= 10485760`)]);
