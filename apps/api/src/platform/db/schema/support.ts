import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt, uuidPk } from './columns.js';
import { users } from './identity.js';
import { workspaces } from './tenancy.js';
export const ticketDepartment = pgEnum('ticket_department', ['TECHNICAL', 'BILLING', 'GENERAL']);
export const ticketPriority = pgEnum('ticket_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const ticketStatus = pgEnum('ticket_status', [
  'OPEN',
  'IN_PROGRESS',
  'ANSWERED',
  'RESOLVED',
  'CLOSED',
]);
export const supportSenderType = pgEnum('support_sender_type', ['USER', 'AGENT']);
export const supportUploadStatus = pgEnum('support_upload_status', ['pending', 'ready', 'rejected']);
/** Account-private support context, not a workspace collaboration table. RLS keys on requester/agent. */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuidPk(),
    referenceNumber: bigint({ mode: 'number' })
      .generatedAlwaysAsIdentity({ startWith: 1000, maxValue: 9007199254740991 })
      .notNull()
      .unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    workspaceId: uuid('related_workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    workspaceName: text().notNull(),
    subject: text().notNull(),
    department: ticketDepartment().notNull(),
    priority: ticketPriority().notNull(),
    status: ticketStatus().notNull().default('OPEN'),
    assignedAdminId: uuid().references(() => users.id, { onDelete: 'set null' }),
    commandId: uuid().notNull(),
    commandHash: text().notNull(),
    version: integer().notNull().default(1),
    lastPublicSeq: integer().notNull().default(1),
    userReadSeq: integer().notNull().default(1),
    agentReadSeq: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('support_ticket_command_uq').on(t.userId, t.commandId),
    check('support_ticket_subject_ck', sql`char_length(btrim(${t.subject})) between 3 and 160`),
    check(
      'support_ticket_sequence_ck',
      sql`${t.version} > 0 and ${t.lastPublicSeq} > 0 and ${t.userReadSeq} between 0 and ${t.lastPublicSeq} and ${t.agentReadSeq} between 0 and ${t.lastPublicSeq}`,
    ),
    index('support_ticket_owner_idx').on(t.userId, t.updatedAt.desc(), t.id.desc()),
    index('support_ticket_rate_idx').on(t.userId, t.createdAt),
    index('support_ticket_queue_idx').on(t.status, t.priority, t.department, t.updatedAt.desc(), t.id.desc()),
    index('support_ticket_assignee_idx').on(t.assignedAdminId, t.updatedAt.desc()),
  ],
);
export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuidPk(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'restrict' }),
    senderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    senderType: supportSenderType().notNull(),
    body: text().notNull(),
    isInternal: boolean().notNull().default(false),
    publicSeq: integer(),
    commandId: uuid().notNull(),
    commandHash: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('support_message_parent_uq').on(t.ticketId, t.id),
    unique('support_message_command_uq').on(t.ticketId, t.senderId, t.commandId),
    unique('support_message_public_seq_uq').on(t.ticketId, t.publicSeq),
    check('support_message_body_ck', sql`char_length(btrim(${t.body})) between 1 and 8000`),
    check(
      'support_message_visibility_ck',
      sql`(${t.isInternal} and ${t.senderType} = 'AGENT' and ${t.publicSeq} is null) or (not ${t.isInternal} and ${t.publicSeq} is not null and ${t.publicSeq} > 0)`,
    ),
    index('support_message_thread_idx').on(t.ticketId, t.createdAt.desc(), t.id.desc()),
  ],
);
export const supportUploads = pgTable(
  'support_uploads',
  {
    id: uuidPk(),
    uploaderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    workspaceId: uuid('related_workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    ticketId: uuid().references(() => supportTickets.id, { onDelete: 'restrict' }),
    messageId: uuid(),
    senderType: supportSenderType().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    status: supportUploadStatus().notNull().default('pending'),
    commandId: uuid().notNull(),
    commandHash: text().notNull(),
    createdAt: createdAt(),
    expiresAt: instant().notNull(),
  },
  (t) => [
    unique('support_upload_command_uq').on(t.uploaderId, t.commandId),
    foreignKey({
      columns: [t.ticketId, t.messageId],
      foreignColumns: [supportMessages.ticketId, supportMessages.id],
    }).onDelete('restrict'),
    check('support_upload_parent_ck', sql`${t.messageId} is null or ${t.ticketId} is not null`),
    check('support_upload_size_ck', sql`${t.sizeBytes} between 1 and 10485760`),
    check('support_upload_name_ck', sql`char_length(${t.fileName}) between 1 and 255`),
    index('support_upload_message_idx').on(t.messageId),
    index('support_upload_ticket_idx').on(t.ticketId),
    index('support_upload_rate_idx').on(t.uploaderId, t.createdAt),
  ],
);
