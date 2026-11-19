import { type SQL, sql } from 'drizzle-orm';
import type {
  AttachmentView,
  ColumnView,
  IssueSeverity,
  IssueType,
  SmartView,
  SubtaskView,
  TaskCard,
  TaskCommentView,
  TaskEventView,
  TaskPriority,
  TaskStatus,
  TagTone,
  ProjectRole,
  ProjectVisibility,
} from '@taskin/contracts';
import { escapeLike, normaliseForSearch } from '@taskin/text';
import { iso, isoDate, isoDateOrNull, isoOrNull, num } from '../../platform/db/rows.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { projectVisibleSql } from './access.js';

/**
 * The task read models: each endpoint is one SQL statement (joins and correlated aggregates over
 * primary-key or indexed lookups), so a board of 20 cards and one of 2,000 cost the same number of
 * round trips. The same builders serve the API and the EXPLAIN checks of the performance suite.
 */

export interface CardRow extends Record<string, unknown> {
  id: string;
  code: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  column_id: string;
  position: string;
  assignee_ids: string[];
  reviewer_id: string | null;
  start_date: string;
  due_date: string | null;
  label_ids: string[];
  starred: boolean;
  subtask_count: number | string;
  subtask_done_count: number | string;
  comment_count: number | string;
  attachment_count: number | string;
  completed_at: string | null;
  archived: boolean;
  source_message_id: string | null;
  source_note_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  /** Exact `created_at` text, for keyset cursors (ISO would lose the microseconds). */
  sort_created?: string;
  type: IssueType;
  severity: IssueSeverity | null;
  estimated_minutes: number | null;
  is_backlog: boolean;
  spent_minutes: number | string;
  blocked_by_ids: string[];
}

/**
 * The tasks blocking `task`, as `blocker_id` rows: `X blocks task` and `task blocked_by X` are
 * the same edge. Only live, unarchived blockers count; the pair index keeps each one unique.
 */
function blockersOf(task: SQL): SQL {
  return sql`
    select e.blocker_id from (
      select d.source_task_id as blocker_id from task_dependencies d where d.target_task_id = ${task} and d.type = 'blocks'
      union all
      select d.target_task_id from task_dependencies d where d.source_task_id = ${task} and d.type = 'blocked_by'
    ) e
    join tasks bt on bt.id = e.blocker_id and bt.deleted_at is null and bt.archived_at is null`;
}

/**
 * The card columns of one `tasks t` row joined to `projects p`, for the viewer `userId`, as
 * correlated sub-queries: right for one task (detail, write paths); lists use `cardsFrom`.
 */
export function cardColumns(userId: string): SQL {
  return sql`
    t.id, p.key || '-' || t.number as code, t.project_id, t.title, t.status, t.priority, t.column_id, t.position,
    coalesce((select array_agg(a.user_id order by a.assigned_at, a.user_id) from task_assignees a where a.task_id = t.id), '{}') as assignee_ids,
    t.reviewer_id, t.start_date, t.due_date,
    coalesce((select array_agg(l.label_id order by l.label_id) from task_labels l where l.task_id = t.id), '{}') as label_ids,
    exists (select 1 from task_stars s where s.user_id = ${userId} and s.task_id = t.id) as starred,
    (select count(*) from subtasks st where st.task_id = t.id) as subtask_count,
    (select count(*) from subtasks st where st.task_id = t.id and st.done) as subtask_done_count,
    (select count(*) from task_comments c where c.task_id = t.id and c.deleted_at is null) as comment_count,
    (select count(*) from task_attachments ta where ta.task_id = t.id) as attachment_count,
    t.completed_at, t.archived_at is not null as archived, t.source_message_id, t.source_note_id, t.version,
    t.created_at, t.updated_at,
    t.type, t.severity, t.estimated_minutes, t.is_backlog,
    coalesce((select sum(w.duration_minutes) from task_worklogs w where w.task_id = t.id), 0) as spent_minutes,
    coalesce((select array_agg(b.blocker_id order by b.blocker_id) from (${blockersOf(sql`t.id`)}) b), '{}') as blocked_by_ids`;
}

/**
 * Cards for many tasks at once. `base` selects the page's task rows (`t.*` plus
 * `p.key as project_key`, filtered, ordered and limited). Each child table is then read in one
 * index scan over the page's ids (`= any(array(select id from t))`, an init plan run once),
 * grouped and hash-joined back. A 1,000-card board costs six index scans, not six probes per card.
 */
export function cardsFrom(userId: string, base: SQL, order: SQL): SQL {
  return sql`
    with t as materialized (${base}),
    a as (select x.task_id, array_agg(x.user_id order by x.assigned_at, x.user_id) as ids from task_assignees x
          where x.task_id = any(array(select id from t)) group by x.task_id),
    l as (select x.task_id, array_agg(x.label_id order by x.label_id) as ids from task_labels x
          where x.task_id = any(array(select id from t)) group by x.task_id),
    s as (select x.task_id, count(*) as n, count(*) filter (where x.done) as d from subtasks x
          where x.task_id = any(array(select id from t)) group by x.task_id),
    c as (select x.task_id, count(*) as n from task_comments x
          where x.task_id = any(array(select id from t)) and x.deleted_at is null group by x.task_id),
    f as (select x.task_id, count(*) as n from task_attachments x
          where x.task_id = any(array(select id from t)) group by x.task_id),
    r as (select x.task_id from task_stars x where x.user_id = ${userId} and x.task_id = any(array(select id from t))),
    w as (select x.task_id, sum(x.duration_minutes) as n from task_worklogs x
          where x.task_id = any(array(select id from t)) group by x.task_id),
    b as (select e.blocked_id as task_id, array_agg(e.blocker_id order by e.blocker_id) as ids
          from (select x.target_task_id as blocked_id, x.source_task_id as blocker_id from task_dependencies x
                where x.type = 'blocks' and x.target_task_id = any(array(select id from t))
                union all
                select x.source_task_id, x.target_task_id from task_dependencies x
                where x.type = 'blocked_by' and x.source_task_id = any(array(select id from t))) e
          join tasks bt on bt.id = e.blocker_id and bt.deleted_at is null and bt.archived_at is null
          group by e.blocked_id)
    select t.id, t.project_key || '-' || t.number as code, t.project_id, t.title, t.status, t.priority, t.column_id, t.position,
      coalesce(a.ids, '{}') as assignee_ids, t.reviewer_id, t.start_date, t.due_date, coalesce(l.ids, '{}') as label_ids,
      r.task_id is not null as starred, coalesce(s.n, 0) as subtask_count, coalesce(s.d, 0) as subtask_done_count,
      coalesce(c.n, 0) as comment_count, coalesce(f.n, 0) as attachment_count,
      t.completed_at, t.archived_at is not null as archived, t.source_message_id, t.source_note_id, t.version,
      t.created_at, t.updated_at, t.created_at::text as sort_created,
      t.type, t.severity, t.estimated_minutes, t.is_backlog, coalesce(w.n, 0) as spent_minutes, coalesce(b.ids, '{}') as blocked_by_ids
    from t
    left join a on a.task_id = t.id
    left join l on l.task_id = t.id
    left join s on s.task_id = t.id
    left join c on c.task_id = t.id
    left join f on f.task_id = t.id
    left join r on r.task_id = t.id
    left join w on w.task_id = t.id
    left join b on b.task_id = t.id
    order by ${order}`;
}

export function toCard(row: CardRow): TaskCard {
  return {
    id: row.id,
    code: row.code,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    columnId: row.column_id,
    position: row.position,
    assigneeIds: row.assignee_ids,
    reviewerId: row.reviewer_id,
    startDate: isoDate(row.start_date),
    dueDate: isoDateOrNull(row.due_date),
    labelIds: row.label_ids,
    starred: row.starred,
    subtaskCount: num(row.subtask_count),
    subtaskDoneCount: num(row.subtask_done_count),
    commentCount: num(row.comment_count),
    attachmentCount: num(row.attachment_count),
    completedAt: isoOrNull(row.completed_at),
    archived: row.archived,
    sourceMessageId: row.source_message_id,
    sourceNoteId: row.source_note_id,
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    type: row.type,
    severity: row.severity,
    estimatedMinutes: row.estimated_minutes,
    spentMinutes: num(row.spent_minutes),
    isBacklog: row.is_backlog,
    blockedByIds: row.blocked_by_ids,
  };
}

/* ------------------------------------------------------------------ board */

export interface BoardHeaderRow extends Record<string, unknown> {
  workflow_id: string;
  version: number;
  columns: { id: string; title: string; status: TaskStatus; tone: TagTone | null; builtIn: boolean; position: string }[] | null;
  visible: boolean;
}

/**
 * The project's own workflow with its live columns; no row when the member cannot see the
 * project. (Sub-project cards keep their own columns; the web board places them by status.)
 */
export function boardHeaderQuery(member: MembershipContext, projectId: string): SQL {
  return sql`
    select w.id as workflow_id, w.version,
      (select json_agg(json_build_object('id', c.id, 'title', c.title, 'status', c.status, 'tone', c.tone,
                                         'builtIn', c.is_builtin, 'position', c.position) order by c.position, c.id)
         from board_columns c where c.workflow_id = w.id and c.deleted_at is null) as columns,
      true as visible
    from projects p
    join workflows w on w.workspace_id = p.workspace_id and w.id = p.workflow_id
    where p.workspace_id = ${member.workspaceId} and p.id = ${projectId} and ${projectVisibleSql(member)}`;
}

export function toColumns(rows: BoardHeaderRow['columns']): ColumnView[] {
  return (rows ?? []).map((column) => ({ ...column }));
}

/**
 * Every live, unarchived card of a project and its sub-projects that the member can see, in
 * board order. Sub-projects are included as the web board shows them. Backlog items are not on
 * the board.
 */
export function boardTasksQuery(member: MembershipContext, projectId: string): SQL {
  return cardsFrom(
    member.userId,
    sql`
      select t.*, p.key as project_key
      from tasks t
      join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where t.workspace_id = ${member.workspaceId}
        and t.project_id in (select id from projects where workspace_id = ${member.workspaceId} and (id = ${projectId} or parent_id = ${projectId}))
        and t.deleted_at is null and t.archived_at is null and not t.is_backlog
        and ${projectVisibleSql(member)}`,
    sql`t.column_id, t.position, t.id`,
  );
}

/* ------------------------------------------------------------------ lists */

export interface ListFilter {
  readonly smart: SmartView;
  readonly projectId?: string;
  readonly status?: TaskStatus;
  readonly assigneeId?: string;
  readonly q?: string;
  readonly includeArchived?: boolean;
  /** Only backlog items (`true`) or only board items (`false`); omitted, both. */
  readonly backlog?: boolean;
  /** "Now", for "due soon": today is its date in the workspace's time zone. */
  readonly now: Date;
  /** Opaque cursor from the previous page. */
  readonly cursor?: string;
  readonly limit: number;
}

/** Days ahead that count as "due soon" (the web app's smart view: overdue, or due within 3 days). */
export const DUE_SOON_DAYS = 3;

/** Today in the workspace's time zone, computed in the same statement (no extra round trip). */
export function todaySql(member: MembershipContext, now: Date): SQL {
  return sql`(${now.toISOString()}::timestamptz at time zone (select w.settings ->> 'timeZone' from workspaces w where w.id = ${member.workspaceId}))::date`;
}

interface Cursor {
  readonly value: string;
  readonly id: string;
}

export function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify([value, id])).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && /^[0-9a-f-]{36}$/i.test(parsed[1])) {
      return { value: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw ApiError.validation([{ field: 'cursor', message: 'is not a cursor this API issued' }]);
}

/** The search text for a query string: normalised like `search_text`, as a LIKE pattern. */
export function searchPattern(q: string): string | null {
  const normalised = normaliseForSearch(q);
  return normalised ? `%${escapeLike(normalised)}%` : null;
}

/**
 * A page of cards. "Due soon" pages by due date (soonest first), everything else newest first;
 * both use keyset pagination over `(sort key, id)`, never OFFSET.
 */
export function listQuery(member: MembershipContext, filter: ListFilter): SQL {
  const bySoonest = filter.smart === 'due-soon';
  const conditions: SQL[] = [sql`t.workspace_id = ${member.workspaceId}`, sql`t.deleted_at is null`, projectVisibleSql(member)];
  if (!filter.includeArchived || bySoonest) conditions.push(sql`t.archived_at is null`);
  if (filter.projectId) {
    conditions.push(sql`t.project_id in (select id from projects where workspace_id = ${member.workspaceId} and (id = ${filter.projectId} or parent_id = ${filter.projectId}))`);
  }
  if (filter.status) conditions.push(sql`t.status = ${filter.status}`);
  if (filter.backlog !== undefined) conditions.push(sql`t.is_backlog = ${filter.backlog}`);
  if (filter.assigneeId) conditions.push(sql`exists (select 1 from task_assignees x where x.task_id = t.id and x.user_id = ${filter.assigneeId})`);
  const pattern = filter.q ? searchPattern(filter.q) : null;
  // Matches come from the trigram index (see app.search_task_ids: under row-level security LIKE
  // cannot be an index condition); visibility, order and limit then apply to those rows.
  if (pattern) conditions.push(sql`t.id = any(array(select app.search_task_ids(${pattern})))`);
  if (bySoonest) conditions.push(sql`t.status <> 'done' and t.due_date <= ${todaySql(member, filter.now)} + ${DUE_SOON_DAYS}::int`);
  if (filter.cursor) {
    const cursor = decodeCursor(filter.cursor);
    conditions.push(
      bySoonest
        ? sql`(t.due_date, t.id) > (${cursor.value}::date, ${cursor.id}::uuid)`
        : sql`(t.created_at, t.id) < (${cursor.value}::timestamptz, ${cursor.id}::uuid)`,
    );
  }
  const join =
    filter.smart === 'my-tasks'
      ? sql`join task_assignees me on me.workspace_id = t.workspace_id and me.task_id = t.id and me.user_id = ${member.userId}`
      : filter.smart === 'starred'
        ? sql`join task_stars me on me.task_id = t.id and me.user_id = ${member.userId}`
        : sql``;
  const order = bySoonest ? sql`t.due_date asc, t.id asc` : sql`t.created_at desc, t.id desc`;
  return cardsFrom(
    member.userId,
    sql`
      select t.*, p.key as project_key
      from tasks t
      join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      ${join}
      where ${sql.join(conditions, sql` and `)}
      order by ${order}
      limit ${filter.limit + 1}`,
    order,
  );
}

/** The cursor for the page after the last row returned. */
export function nextCursor(smart: SmartView, rows: readonly CardRow[], limit: number): string | null {
  if (rows.length <= limit) return null;
  const last = rows[limit - 1];
  if (!last) return null;
  return smart === 'due-soon' ? encodeCursor(isoDate(last.due_date ?? ''), last.id) : encodeCursor(last.sort_created ?? last.created_at, last.id);
}

/** Cards whose span `[start, due]` overlaps `[from, to]`, for the Gantt chart. */
export function ganttQuery(member: MembershipContext, range: { projectId?: string; from: string; to: string }, limit: number): SQL {
  return cardsFrom(
    member.userId,
    sql`
      select t.*, p.key as project_key
      from tasks t
      join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where t.workspace_id = ${member.workspaceId} and t.deleted_at is null and t.archived_at is null
        ${range.projectId ? sql`and t.project_id in (select id from projects where workspace_id = ${member.workspaceId} and (id = ${range.projectId} or parent_id = ${range.projectId}))` : sql``}
        and t.start_date <= ${range.to}::date and coalesce(t.due_date, t.start_date) >= ${range.from}::date
        and ${projectVisibleSql(member)}
      order by t.start_date, t.id
      limit ${limit}`,
    sql`t.start_date, t.id`,
  );
}

/* ------------------------------------------------------------------ one task */

export interface DetailRow extends CardRow {
  description: string;
  created_by: string;
  reopen_column_id: string | null;
  project_visibility: ProjectVisibility;
  my_role: ProjectRole | null;
  subtasks: SubtaskView[] | null;
  comments: (Omit<TaskCommentView, 'createdAt' | 'editedAt'> & { createdAt: string; editedAt: string | null })[] | null;
  attachments: (Omit<AttachmentView, 'uploadedAt'> & { uploadedAt: string })[] | null;
  timeline: TaskEventView[] | null;
  source_message: SourceMessageRow | null;
}

/** The message a task came from, with what decides whether the caller may see it. */
export interface SourceMessageRow {
  messageId: string;
  conversationId: string;
  authorId: string | null;
  text: string | null;
  kind: 'text' | 'voice' | 'file' | 'system';
  sentAt: string;
  deleted: boolean;
  conversationKind: 'direct' | 'group' | 'channel';
  isPrivate: boolean;
  isMember: boolean;
}

/**
 * One task with its subtasks, comments, files and latest timeline, plus what the service needs to
 * authorise the read (the project's visibility and the caller's project role), in one statement.
 */
export function detailQuery(member: MembershipContext, taskId: string): SQL {
  return sql`
    select ${cardColumns(member.userId)}, t.description, t.created_by, t.reopen_column_id,
      p.visibility as project_visibility,
      (select pm.role from project_members pm where pm.project_id = p.id and pm.user_id = ${member.userId}) as my_role,
      (select json_agg(json_build_object('id', st.id, 'title', st.title, 'done', st.done, 'assigneeId', st.assignee_id,
                                         'position', st.position) order by st.position, st.id)
         from subtasks st where st.task_id = t.id) as subtasks,
      (select json_agg(json_build_object('id', c.id, 'authorId', c.author_id, 'body', c.body, 'replyToId', c.reply_to_id,
                                         'createdAt', c.created_at, 'editedAt', c.edited_at) order by c.created_at, c.id)
         from task_comments c where c.task_id = t.id and c.deleted_at is null) as comments,
      (select json_agg(json_build_object('id', f.id, 'name', f.file_name, 'kind', f.kind, 'mimeType', f.mime_type,
                                         'size', f.size_bytes, 'status', f.status, 'uploadedById', f.uploader_id,
                                         'uploadedAt', f.created_at) order by ta.added_at, f.id)
         from task_attachments ta
         join attachments f on f.workspace_id = ta.workspace_id and f.id = ta.attachment_id
         where ta.task_id = t.id and f.deleted_at is null) as attachments,
      (select json_agg(json_build_object('id', e.id, 'actorId', e.actor_id, 'type', e.type, 'payload', e.payload,
                                         'createdAt', e.created_at) order by e.created_at desc, e.id desc)
         from (select * from task_events where task_id = t.id order by created_at desc, id desc limit 50) e) as timeline,
      (select json_build_object('messageId', sm.id, 'conversationId', sm.conversation_id, 'authorId', sm.author_id,
                                'text', case when sm.deleted_at is null then left(sm.body_text, 140) end, 'kind', sm.kind,
                                'sentAt', sm.created_at, 'deleted', sm.deleted_at is not null,
                                'conversationKind', sc.kind, 'isPrivate', sc.is_private,
                                'isMember', exists (select 1 from conversation_members scm
                                                    where scm.workspace_id = sm.workspace_id and scm.conversation_id = sm.conversation_id
                                                      and scm.user_id = ${member.userId} and scm.left_at is null))
         from messages sm
         join conversations sc on sc.workspace_id = sm.workspace_id and sc.id = sm.conversation_id
         where sm.workspace_id = t.workspace_id and sm.id = t.source_message_id) as source_message
    from tasks t
    join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
    where t.workspace_id = ${member.workspaceId} and t.id = ${taskId} and t.deleted_at is null and p.deleted_at is null`;
}

/** One card, for a caller already authorised (write paths, 412 bodies). */
export function cardQuery(member: MembershipContext, taskId: string): SQL {
  return sql`
    select ${cardColumns(member.userId)}
    from tasks t
    join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
    where t.workspace_id = ${member.workspaceId} and t.id = ${taskId}`;
}
