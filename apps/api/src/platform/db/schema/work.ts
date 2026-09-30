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
import { createdAt, instant, position, updatedAt, uuidPk } from './columns.js';
import { avatarTone, issueSeverity, issueType, projectRole, projectVisibility, tagTone, taskDependencyType, taskPriority, taskStatus } from './enums.js';
import { workspaceMembers, workspaces } from './tenancy.js';

/**
 * Projects, the board and tasks (RFC §7). Every table is tenant-scoped with row-level security.
 * People are referenced as `(workspace_id, user_id)` → `workspace_members`, so an assignee, a
 * reviewer or an author is always someone who belongs (or belonged) to this workspace. Members
 * are never deleted (they leave), so these references never dangle.
 *
 * Every foreign key is NO ACTION unless noted: a workspace purge cascades through all of them in
 * one statement, which NO ACTION (checked at the end of the statement) allows and RESTRICT may not.
 */

const tenant = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

/** A `(workspace_id, user_id)` reference to a workspace member. */
const member = (name: string, columns: Parameters<typeof foreignKey>[0]['columns']) =>
  foreignKey({ name, columns, foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId] });

/** The workflow every project uses (one per workspace in v1, matching today's single board). */
export const workflows = pgTable(
  'workflows',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    name: text().notNull(),
    isDefault: boolean().notNull().default(true),
    /** Bumped by every column change; boards compare it to know they are stale. */
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('workflows_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('workflows_default_uq').on(t.workspaceId).where(sql`${t.isDefault}`),
  ],
);

export const boardColumns = pgTable(
  'board_columns',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    workflowId: uuid().notNull(),
    title: text().notNull(),
    /** The status a card takes when it lands here. */
    status: taskStatus().notNull(),
    /** Custom columns pick a tag tone; built-ins paint with their status tone (`null`). */
    tone: tagTone(),
    isBuiltin: boolean().notNull().default(false),
    position: position().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: instant(),
  },
  (t) => [
    unique('board_columns_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'board_columns_workflow_fk', columns: [t.workspaceId, t.workflowId], foreignColumns: [workflows.workspaceId, workflows.id] }).onDelete(
      'cascade',
    ),
    uniqueIndex('board_columns_title_uq').on(t.workflowId, sql`lower(${t.title})`).where(sql`${t.deletedAt} is null`),
    index('board_columns_position_idx').on(t.workflowId, t.position).where(sql`${t.deletedAt} is null`),
    check('board_columns_title_len', sql`char_length(${t.title}) between 1 and 32`),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    /** Upper-case task-code prefix, unique among live projects. */
    key: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    /** Composite FK with ON DELETE SET NULL (department_id), declared in the SQL migration. */
    departmentId: uuid(),
    color: avatarTone().notNull().default('brand'),
    /** Always null: projects are flat since Phase 3.1 (`projects_flat`); the column is to be dropped. */
    parentId: uuid(),
    visibility: projectVisibility().notNull().default('workspace'),
    workflowId: uuid().notNull(),
    /** The last task number handed out; the row is locked while a task is numbered. */
    taskSeq: bigint({ mode: 'number' }).notNull().default(0),
    createdBy: uuid().notNull(),
    archivedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * In the trash: hidden from every query (row-level security too) and restorable by the
     * workspace owner for 40 days, then purged with its tasks.
     */
    deletedAt: instant(),
    deletedBy: uuid(),
  },
  (t) => [
    unique('projects_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('projects_ws_key_uq').on(t.workspaceId, t.key).where(sql`${t.deletedAt} is null`),
    index('projects_ws_parent_idx').on(t.workspaceId, t.parentId),
    index('projects_trash_idx').on(t.deletedAt).where(sql`${t.deletedAt} is not null`),
    foreignKey({ name: 'projects_parent_fk', columns: [t.workspaceId, t.parentId], foreignColumns: [t.workspaceId, t.id] }),
    foreignKey({ name: 'projects_workflow_fk', columns: [t.workspaceId, t.workflowId], foreignColumns: [workflows.workspaceId, workflows.id] }),
    member('projects_created_by_fk', [t.workspaceId, t.createdBy]),
    member('projects_deleted_by_fk', [t.workspaceId, t.deletedBy]),
    check('projects_key_format', sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,5}$'`),
    check('projects_name_len', sql`char_length(${t.name}) between 1 and 80`),
    check('projects_description_len', sql`char_length(${t.description}) <= 2000`),
    check('projects_not_own_parent', sql`${t.parentId} is distinct from ${t.id}`),
    check('projects_flat', sql`${t.parentId} is null`),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    workspaceId: tenant(),
    projectId: uuid().notNull(),
    userId: uuid().notNull(),
    role: projectRole().notNull(),
    addedBy: uuid(),
    addedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'project_members_pk', columns: [t.projectId, t.userId] }),
    foreignKey({ name: 'project_members_project_fk', columns: [t.workspaceId, t.projectId], foreignColumns: [projects.workspaceId, projects.id] }).onDelete(
      'cascade',
    ),
    member('project_members_user_fk', [t.workspaceId, t.userId]),
    index('project_members_user_idx').on(t.workspaceId, t.userId),
  ],
);

/** Stars are per user, unlike the single-user fixtures. */
export const projectStars = pgTable(
  'project_stars',
  {
    userId: uuid().notNull(),
    workspaceId: tenant(),
    projectId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'project_stars_pk', columns: [t.userId, t.projectId] }),
    foreignKey({ name: 'project_stars_project_fk', columns: [t.workspaceId, t.projectId], foreignColumns: [projects.workspaceId, projects.id] }).onDelete(
      'cascade',
    ),
    member('project_stars_user_fk', [t.workspaceId, t.userId]),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    projectId: uuid().notNull(),
    /** Per project; the code is `project.key || '-' || number`. */
    number: bigint({ mode: 'number' }).notNull(),
    title: text().notNull(),
    description: text().notNull().default(''),
    columnId: uuid().notNull(),
    /** Always the column's status: the `tasks_sync_status` trigger writes it. */
    status: taskStatus().notNull(),
    position: position().notNull(),
    priority: taskPriority().notNull().default('medium'),
    reviewerId: uuid(),
    /** Calendar dates in the workspace time zone. */
    startDate: date({ mode: 'string' }).notNull(),
    dueDate: date({ mode: 'string' }),
    completedAt: instant(),
    /** Where "reopen" puts a done task back (the UI's `reopenTo`). */
    reopenColumnId: uuid(),
    /** The chat message this task came from; its foreign key arrives with the messages table (M3). */
    sourceMessageId: uuid(),
    /** Composite FK with ON DELETE SET NULL (source_note_id), declared in the SQL migration. */
    sourceNoteId: uuid(),
    createdBy: uuid().notNull(),
    version: integer().notNull().default(1),
    /** Title, code and description through `normaliseForSearch`. */
    searchText: text().notNull(),
    archivedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: instant(),
    /** Agile tracking (0017): every task that predates it is a plain `task` on the board. */
    type: issueType().notNull().default('task'),
    severity: issueSeverity(),
    estimatedMinutes: integer(),
    /** Backlog items keep their column and position; the board simply leaves them out. */
    isBacklog: boolean().notNull().default(false),
  },
  (t) => [
    unique('tasks_ws_id_uq').on(t.workspaceId, t.id),
    unique('tasks_project_number_uq').on(t.projectId, t.number),
    foreignKey({ name: 'tasks_project_fk', columns: [t.workspaceId, t.projectId], foreignColumns: [projects.workspaceId, projects.id] }),
    foreignKey({ name: 'tasks_column_fk', columns: [t.workspaceId, t.columnId], foreignColumns: [boardColumns.workspaceId, boardColumns.id] }),
    foreignKey({ name: 'tasks_reopen_column_fk', columns: [t.workspaceId, t.reopenColumnId], foreignColumns: [boardColumns.workspaceId, boardColumns.id] }),
    member('tasks_reviewer_fk', [t.workspaceId, t.reviewerId]),
    member('tasks_created_by_fk', [t.workspaceId, t.createdBy]),
    // One message, one note → at most one live task.
    uniqueIndex('tasks_source_message_uq').on(t.sourceMessageId).where(sql`${t.sourceMessageId} is not null and ${t.deletedAt} is null`),
    uniqueIndex('tasks_source_note_uq').on(t.sourceNoteId).where(sql`${t.sourceNoteId} is not null and ${t.deletedAt} is null`),
    // Moves and column removal: the cards of one column, in order.
    index('tasks_column_position_idx').on(t.workspaceId, t.columnId, t.position).where(sql`${t.deletedAt} is null and ${t.archivedAt} is null`),
    // The board and filtered lists of a project.
    index('tasks_project_status_idx').on(t.workspaceId, t.projectId, t.status).where(sql`${t.deletedAt} is null and ${t.archivedAt} is null`),
    // Calendar deadlines and "due soon".
    index('tasks_due_idx').on(t.workspaceId, t.dueDate).where(sql`${t.deletedAt} is null and ${t.archivedAt} is null and ${t.status} <> 'done'`),
    // Keyset pagination of lists, newest first.
    index('tasks_created_idx').on(t.workspaceId, t.createdAt, t.id).where(sql`${t.deletedAt} is null`),
    // Persian search (btree_gin lets the tenant key share the trigram index).
    index('tasks_search_idx').using('gin', t.workspaceId, t.searchText.op('gin_trgm_ops')).where(sql`${t.deletedAt} is null`),
    check('tasks_title_len', sql`char_length(${t.title}) between 1 and 200`),
    check('tasks_description_len', sql`char_length(${t.description}) <= 20000`),
    check('tasks_dates', sql`${t.dueDate} is null or ${t.dueDate} >= ${t.startDate}`),
    check('tasks_severity_bug_only', sql`${t.severity} is null or ${t.type} = 'bug'`),
    check('tasks_estimate_range', sql`${t.estimatedMinutes} is null or ${t.estimatedMinutes} between 1 and 60000`),
  ],
);

export const taskAssignees = pgTable(
  'task_assignees',
  {
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    userId: uuid().notNull(),
    assignedBy: uuid(),
    assignedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'task_assignees_pk', columns: [t.taskId, t.userId] }),
    foreignKey({ name: 'task_assignees_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    member('task_assignees_user_fk', [t.workspaceId, t.userId]),
    // "وظایف من"
    index('task_assignees_user_idx').on(t.workspaceId, t.userId),
  ],
);

export const taskStars = pgTable(
  'task_stars',
  {
    userId: uuid().notNull(),
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'task_stars_pk', columns: [t.userId, t.taskId] }),
    foreignKey({ name: 'task_stars_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    member('task_stars_user_fk', [t.workspaceId, t.userId]),
  ],
);

export const subtasks = pgTable(
  'subtasks',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    assigneeId: uuid(),
    position: position().notNull(),
    completedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('subtasks_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'subtasks_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    member('subtasks_assignee_fk', [t.workspaceId, t.assigneeId]),
    index('subtasks_task_position_idx').on(t.taskId, t.position),
    check('subtasks_title_len', sql`char_length(${t.title}) between 1 and 200`),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    authorId: uuid().notNull(),
    body: text().notNull(),
    replyToId: uuid(),
    createdAt: createdAt(),
    editedAt: instant(),
    deletedAt: instant(),
  },
  (t) => [
    unique('task_comments_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'task_comments_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    foreignKey({ name: 'task_comments_reply_fk', columns: [t.workspaceId, t.replyToId], foreignColumns: [t.workspaceId, t.id] }),
    member('task_comments_author_fk', [t.workspaceId, t.authorId]),
    index('task_comments_task_idx').on(t.taskId, t.createdAt),
    check('task_comments_body_len', sql`char_length(${t.body}) between 1 and 4000`),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    name: text().notNull(),
    tone: tagTone().notNull().default('gray'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('labels_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('labels_ws_name_uq').on(t.workspaceId, sql`lower(${t.name})`),
    check('labels_name_len', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

export const taskLabels = pgTable(
  'task_labels',
  {
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    labelId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: 'task_labels_pk', columns: [t.taskId, t.labelId] }),
    foreignKey({ name: 'task_labels_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    foreignKey({ name: 'task_labels_label_fk', columns: [t.workspaceId, t.labelId], foreignColumns: [labels.workspaceId, labels.id] }).onDelete('cascade'),
    index('task_labels_label_idx').on(t.labelId),
  ],
);

/** The task timeline: created, moved, completed, assigned, commented… */
export const taskEvents = pgTable(
  'task_events',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    actorId: uuid(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'task_events_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    index('task_events_task_idx').on(t.taskId, t.createdAt),
  ],
);

/** Time spent on a task (Agile tracking): one row per logged stretch of work. */
export const taskWorklogs = pgTable(
  'task_worklogs',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    taskId: uuid().notNull(),
    userId: uuid().notNull(),
    durationMinutes: integer().notNull(),
    description: text().notNull().default(''),
    /** When the work happened; defaults to when it was logged. */
    loggedAt: instant().notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('task_worklogs_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'task_worklogs_task_fk', columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete('cascade'),
    member('task_worklogs_user_fk', [t.workspaceId, t.userId]),
    index('task_worklogs_task_idx').on(t.taskId, t.loggedAt),
    check('task_worklogs_duration', sql`${t.durationMinutes} between 1 and 1440`),
    check('task_worklogs_description_len', sql`char_length(${t.description}) <= 500`),
  ],
);

/**
 * Links between two tasks of one project. Rows are stored as created: `A blocked_by B` is the
 * same edge as `B blocks A`, and a pair of tasks has at most one link whichever way it points.
 * Blocking edges never form a cycle (checked under a per-project lock when a link is added).
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    projectId: uuid().notNull(),
    sourceTaskId: uuid().notNull(),
    targetTaskId: uuid().notNull(),
    type: taskDependencyType().notNull(),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('task_dependencies_ws_id_uq').on(t.workspaceId, t.id),
    foreignKey({ name: 'task_dependencies_project_fk', columns: [t.workspaceId, t.projectId], foreignColumns: [projects.workspaceId, projects.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'task_dependencies_source_fk', columns: [t.workspaceId, t.sourceTaskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'task_dependencies_target_fk', columns: [t.workspaceId, t.targetTaskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete(
      'cascade',
    ),
    member('task_dependencies_created_by_fk', [t.workspaceId, t.createdBy]),
    uniqueIndex('task_dependencies_pair_uq').on(sql`least(${t.sourceTaskId}, ${t.targetTaskId})`, sql`greatest(${t.sourceTaskId}, ${t.targetTaskId})`),
    index('task_dependencies_source_idx').on(t.sourceTaskId),
    index('task_dependencies_target_idx').on(t.targetTaskId),
    check('task_dependencies_not_self', sql`${t.sourceTaskId} <> ${t.targetTaskId}`),
  ],
);
