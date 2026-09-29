import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, createdAt, instant, updatedAt, uuidPk } from './columns.js';
import {
  activityKind,
  attachmentKind,
  attachmentStatus,
  attendeeResponse,
  eventKind,
  notificationKind,
  tagTone,
} from './enums.js';
import { users } from './identity.js';
import { workspaceMembers, workspaces } from './tenancy.js';
import { projects, tasks } from './work.js';

/** Files, calendar, notes, notifications and activity (RFC §8, chat excepted). */

const tenant = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

/** A `(workspace_id, user_id)` reference to a workspace member. */
const member = (name: string, columns: Parameters<typeof foreignKey>[0]['columns']) =>
  foreignKey({ name, columns, foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId] });

/**
 * One uploaded file. The row exists from the moment the upload is planned (`pending`); the bytes
 * go straight from the browser to object storage, and completion checks their size and real type.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    uploaderId: uuid().notNull(),
    bucket: text().notNull(),
    /** `ws/{workspaceId}/att/{id}`: a workspace purge deletes the whole prefix. */
    objectKey: text().notNull(),
    /** Bidi controls stripped, NFC-normalised. */
    fileName: text().notNull(),
    /** The client's claim until completion, then what the bytes really are. */
    mimeType: text().notNull(),
    kind: attachmentKind().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    checksumSha256: bytea(),
    status: attachmentStatus().notNull().default('pending'),
    /** The S3 multipart upload id, for uploads over 16 MB. */
    multipartUploadId: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    thumbnailKey: text(),
    createdAt: createdAt(),
    readyAt: instant(),
    deletedAt: instant(),
  },
  (t) => [
    unique('attachments_ws_id_uq').on(t.workspaceId, t.id),
    unique('attachments_object_key_uq').on(t.objectKey),
    member('attachments_uploader_fk', [t.workspaceId, t.uploaderId]),
    // Garbage collection of stale pending uploads and unlinked files.
    index('attachments_status_idx').on(t.workspaceId, t.status, t.createdAt),
    check('attachments_size', sql`${t.sizeBytes} > 0`),
    check('attachments_name_len', sql`char_length(${t.fileName}) between 1 and 255`),
  ],
);

export const taskAttachments = pgTable(
  'task_attachments',
  {
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    attachmentId: uuid().notNull(),
    addedBy: uuid(),
    addedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'task_attachments_pk', columns: [t.taskId, t.attachmentId] }),
    foreignKey({ name: 'task_attachments_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    foreignKey({
      name: 'task_attachments_attachment_fk',
      columns: [t.workspaceId, t.attachmentId],
      foreignColumns: [attachments.workspaceId, attachments.id],
    }),
    index('task_attachments_attachment_idx').on(t.attachmentId),
  ],
);

/**
 * Meetings, reminders and milestones. All-day entries use `start_date`/`end_date` (workspace-zone
 * dates); timed ones use `starts_at`/`ends_at` (instants). Task deadlines are never stored here.
 */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    kind: eventKind().notNull(),
    title: text().notNull(),
    description: text().notNull().default(''),
    projectId: uuid(),
    allDay: boolean().notNull(),
    startDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    startsAt: instant(),
    endsAt: instant(),
    /** The zone the event was written in, so a later settings change does not move it. */
    timeZone: text().notNull(),
    /** RRULE, reserved for v2. */
    recurrenceRule: text(),
    createdBy: uuid().notNull(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: instant(),
  },
  (t) => [
    unique('calendar_events_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'calendar_events_project_fk', columns: [t.workspaceId, t.projectId], foreignColumns: [projects.workspaceId, projects.id] }),
    member('calendar_events_created_by_fk', [t.workspaceId, t.createdBy]),
    index('calendar_events_starts_idx').on(t.workspaceId, t.startsAt).where(sql`${t.deletedAt} is null`),
    index('calendar_events_start_date_idx').on(t.workspaceId, t.startDate).where(sql`${t.deletedAt} is null`),
    check('calendar_events_title_len', sql`char_length(${t.title}) between 1 and 120`),
    check(
      'calendar_events_timing',
      sql`(${t.allDay} and ${t.startDate} is not null and ${t.startsAt} is null and (${t.endDate} is null or ${t.endDate} >= ${t.startDate}))
       or (not ${t.allDay} and ${t.startsAt} is not null and (${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}))`,
    ),
  ],
);

export const calendarEventAttendees = pgTable(
  'calendar_event_attendees',
  {
    workspaceId: tenant(),
    eventId: uuid().notNull(),
    userId: uuid().notNull(),
    response: attendeeResponse().notNull().default('pending'),
  },
  (t) => [
    primaryKey({ name: 'calendar_event_attendees_pk', columns: [t.eventId, t.userId] }),
    foreignKey({
      name: 'calendar_event_attendees_event_fk',
      columns: [t.workspaceId, t.eventId],
      foreignColumns: [calendarEvents.workspaceId, calendarEvents.id],
    }).onDelete('cascade'),
    member('calendar_event_attendees_user_fk', [t.workspaceId, t.userId]),
    index('calendar_event_attendees_user_idx').on(t.workspaceId, t.userId),
  ],
);

/** Notebooks, per member. The four built-ins are created on first use; any notebook can be deleted. */
export const noteCategories = pgTable(
  'note_categories',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    ownerId: uuid().notNull(),
    /** `personal`, `work`, `ideas` or `meetings` for the built-ins. */
    key: text(),
    label: text().notNull(),
    isBuiltin: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    /**
     * A deleted built-in stays as a tombstone, so seeding the built-ins (which runs on every
     * read) never brings it back; a custom category is removed outright.
     */
    deletedAt: instant(),
  },
  (t) => [
    unique('note_categories_ws_id_uq').on(t.workspaceId, t.id),
    member('note_categories_owner_fk', [t.workspaceId, t.ownerId]),
    // A deleted built-in's name is free again for a notebook of one's own.
    uniqueIndex('note_categories_label_uq').on(t.workspaceId, t.ownerId, sql`lower(${t.label})`).where(sql`${t.deletedAt} is null`),
    uniqueIndex('note_categories_key_uq').on(t.workspaceId, t.ownerId, t.key).where(sql`${t.key} is not null`),
    check('note_categories_label_len', sql`char_length(${t.label}) between 1 and 40`),
  ],
);

/**
 * Private notes. Deleting one removes it (no tombstone). A note whose notebook was deleted keeps
 * everything else and has no category (`category_id` null) until it is filed again.
 */
export const notes = pgTable(
  'notes',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    ownerId: uuid().notNull(),
    categoryId: uuid(),
    title: text().notNull().default(''),
    body: text().notNull().default(''),
    colors: tagTone().array().notNull().default(sql`'{}'`),
    pinnedAt: instant(),
    version: integer().notNull().default(1),
    searchText: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('notes_ws_id_uq').on(t.workspaceId, t.id),
    member('notes_owner_fk', [t.workspaceId, t.ownerId]),
    foreignKey({ name: 'notes_category_fk', columns: [t.workspaceId, t.categoryId], foreignColumns: [noteCategories.workspaceId, noteCategories.id] }),
    index('notes_owner_category_idx').on(t.workspaceId, t.ownerId, t.categoryId, t.updatedAt.desc()),
    index('notes_search_idx').using('gin', t.workspaceId, t.searchText.op('gin_trgm_ops')),
    check('notes_title_len', sql`char_length(${t.title}) <= 200`),
    check('notes_body_len', sql`char_length(${t.body}) <= 100000`),
  ],
);

/** A member's inbox, across workspaces (the bell shows every workspace's unread count). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid(),
    kind: notificationKind().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** The task's or event's title when it happened. */
    subject: text().notNull(),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    /** Collapses a storm (repeated moves of one task) into one unread notification. */
    dedupeKey: text(),
    readAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientId, t.workspaceId, t.createdAt.desc()),
    index('notifications_unread_idx').on(t.recipientId).where(sql`${t.readAt} is null`),
    uniqueIndex('notifications_dedupe_uq').on(t.recipientId, t.dedupeKey).where(sql`${t.dedupeKey} is not null and ${t.readAt} is null`),
    check('notifications_target_type', sql`${t.targetType} in ('task', 'conversation', 'message', 'event', 'workspace')`),
  ],
);

/** The workspace feed ("فعالیت‌های اخیر"), filtered at read time by project access. */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    actorId: uuid(),
    kind: activityKind().notNull(),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    targetTitle: text().notNull(),
    context: text().notNull().default(''),
    projectId: uuid(),
    /** The outbox event it came from: a redelivered event never adds a second row. */
    sourceEventId: bigint({ mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_events_ws_idx').on(t.workspaceId, t.createdAt.desc(), t.id.desc()),
    uniqueIndex('activity_events_source_uq').on(t.sourceEventId).where(sql`${t.sourceEventId} is not null`),
  ],
);
