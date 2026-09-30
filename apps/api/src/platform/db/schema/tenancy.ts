import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PlanLimits, WorkspaceSettings } from '@taskin/contracts';
import { bytea, citext, createdAt, instant, updatedAt, uuidPk } from './columns.js';
import {
  avatarTone,
  invitationChannel,
  invitationStatus,
  memberStatus,
  permissionAction,
  permissionModule,
  presenceStatus,
} from './enums.js';
import { users } from './identity.js';

/**
 * Tenancy: every table below except `plans` carries `workspace_id` and row-level security (see
 * the policies migration). Children reference their parents by `(workspace_id, id)`, so a row can
 * never point into another tenant even if application code gets an id wrong.
 */

export const plans = pgTable('plans', {
  id: text().primaryKey(),
  name: text().notNull(),
  limits: jsonb().$type<PlanLimits>().notNull(),
  createdAt: createdAt(),
});

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  timeZone: 'Asia/Tehran',
  weekStart: 'saturday',
  weekend: ['friday'],
  systemMessageOnConvert: true,
  allowedEmailDomains: [],
};

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuidPk(),
    slug: citext().notNull().unique('workspaces_slug_uq'),
    name: text().notNull(),
    description: text().notNull().default(''),
    initials: text().notNull(),
    tone: avatarTone().notNull(),
    iconKey: text(),
    /** The Owner: the only member who may delete the workspace or transfer it. */
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    planId: text()
      .notNull()
      .default('free')
      .references(() => plans.id),
    settings: jsonb().$type<WorkspaceSettings>().notNull().default(DEFAULT_WORKSPACE_SETTINGS),
    /** Seats in use (active and suspended members); invitation acceptance checks it atomically. */
    memberCount: integer().notNull().default(1),
    storageUsedBytes: bigint({ mode: 'number' }).notNull().default(0),
    storageReservedBytes: bigint({ mode: 'number' }).notNull().default(0),
    /** Bumped by every role, matrix or membership change; permission caches are keyed by it. */
    rbacVersion: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: instant(),
    purgeAfter: instant(),
  },
  (t) => [
    check('workspaces_name_len', sql`char_length(${t.name}) between 1 and 40`),
    check('workspaces_description_len', sql`char_length(${t.description}) <= 160`),
    check('workspaces_member_count', sql`${t.memberCount} >= 0`),
    index('workspaces_purge_idx').on(t.purgeAfter).where(sql`${t.deletedAt} is not null`),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: uuidPk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('departments_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('departments_ws_name_uq').on(t.workspaceId, sql`lower(${t.name})`),
    check('departments_name_len', sql`char_length(${t.name}) between 1 and 60`),
  ],
);

/** Workspace roles. v1 ships the five system roles; `key` leaves room for custom ones. */
export const roles = pgTable(
  'roles',
  {
    id: uuidPk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    /** 0 is the most authority, as `SYSTEM_ROLES` in the contracts. */
    rank: smallint().notNull(),
    isSystem: boolean().notNull(),
    /** The owner row: its permissions can never change (enforced by a trigger as well). */
    isLocked: boolean().notNull(),
    /** Optimistic concurrency for matrix edits (`If-Match`). */
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('roles_ws_id_uq').on(t.workspaceId, t.id),
    unique('roles_ws_key_uq').on(t.workspaceId, t.key),
    check('roles_key_format', sql`${t.key} ~ '^[a-z][a-z0-9_-]{1,31}$'`),
  ],
);

/** One row per granted cell of the matrix (module × action). Absent means denied. */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    workspaceId: uuid().notNull(),
    roleId: uuid().notNull(),
    module: permissionModule().notNull(),
    action: permissionAction().notNull(),
  },
  (t) => [
    primaryKey({ name: 'role_permissions_pk', columns: [t.roleId, t.module, t.action] }),
    foreignKey({
      name: 'role_permissions_role_fk',
      columns: [t.workspaceId, t.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }).onDelete('cascade'),
  ],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid().notNull(),
    departmentId: uuid(),
    jobTitle: text().notNull().default(''),
    status: memberStatus().notNull().default('active'),
    presenceStatus: presenceStatus().notNull().default('online'),
    statusMessage: text().notNull().default(''),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    joinedAt: instant().notNull().defaultNow(),
    leftAt: instant(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'workspace_members_pk', columns: [t.workspaceId, t.userId] }),
    foreignKey({
      name: 'workspace_members_role_fk',
      columns: [t.workspaceId, t.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'workspace_members_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [departments.workspaceId, departments.id],
    }).onDelete('restrict'),
    index('workspace_members_user_active_idx').on(t.userId).where(sql`${t.status} = 'active'`),
    check('workspace_members_status_message_len', sql`char_length(${t.statusMessage}) <= 80`),
    check('workspace_members_job_title_len', sql`char_length(${t.jobTitle}) <= 80`),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuidPk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    channel: invitationChannel().notNull(),
    /** A lower-cased email address or an E.164 mobile number. */
    address: text().notNull(),
    roleId: uuid().notNull(),
    departmentId: uuid(),
    message: text().notNull().default(''),
    /** SHA-256 of the 256-bit token in the invitation link. */
    tokenHash: bytea().notNull().unique('invitations_token_uq'),
    status: invitationStatus().notNull().default('pending'),
    invitedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: instant().notNull(),
    acceptedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'invitations_role_fk',
      columns: [t.workspaceId, t.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'invitations_department_fk',
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [departments.workspaceId, departments.id],
    }).onDelete('restrict'),
    // One pending invitation per address and channel: the UI's «دعوت‌نامه در انتظار دارد».
    uniqueIndex('invitations_pending_uq')
      .on(t.workspaceId, t.channel, t.address)
      .where(sql`${t.status} = 'pending'`),
    index('invitations_ws_status_idx').on(t.workspaceId, t.status, t.createdAt),
    check('invitations_message_len', sql`char_length(${t.message}) <= 280`),
  ],
);
