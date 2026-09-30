import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { ConvertMessageBody, ConvertMessageResult, MessageView } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { iso } from '../../platform/db/rows.js';
import { workspaces } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { loadConversation, requireMessageGrant } from '../chat/chat-access.js';
import { TasksService } from '../work/tasks.service.js';

interface SourceRow extends Record<string, unknown> {
  id: string;
  kind: 'text' | 'voice' | 'file' | 'system';
  attachment_id: string | null;
  deleted: boolean;
}

interface Converted {
  readonly taskId: string;
  readonly existing: boolean;
  readonly code: string | null;
  readonly systemMessage: MessageView | null;
}

/**
 * «تبدیل پیام به وظیفه» (RFC §4.1): a task made from a chat message, in one transaction with the
 * task itself. The message is read under a share lock, so it cannot be deleted halfway; the
 * partial unique index on `tasks.source_message_id` keeps one live task per message even when two
 * people convert it at once (the second gets the first one's task, `existing: true`).
 *
 * The caller must be able to read the conversation and create tasks in the target project. Files
 * can only be the message's own: nothing else can be linked through this route. In groups and
 * channels a system line records the conversion (the workspace's `systemMessageOnConvert`);
 * direct chats stay private. After commit the conversation hears `message:task_linked`, which
 * carries the task's code only, since not every member can see the project.
 */
@Injectable()
export class MessageTasksService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TasksService,
    private readonly audit: AuditWriter,
    private readonly publisher: RealtimePublisher,
  ) {}

  async convert(member: MembershipContext, conversationId: string, messageId: string, body: ConvertMessageBody): Promise<ConvertMessageResult> {
    requireMessageGrant(member, 'view');
    let outcome: Converted;
    try {
      outcome = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, (unit) => this.inUnit(unit, member, conversationId, messageId, body));
    } catch (error) {
      // Someone else converted the message between our check and our insert.
      if (!isUniqueViolation(error, 'tasks_source_message_uq')) throw error;
      const taskId = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) => this.linkedTask(tx, member, messageId));
      if (!taskId) throw error;
      outcome = { taskId, existing: true, code: null, systemMessage: null };
    }

    if (!outcome.existing && outcome.code) {
      await this.publisher.emit({
        type: 'message:task_linked',
        workspaceId: member.workspaceId,
        rooms: [rooms.conversation(conversationId)],
        durable: true,
        data: { conversationId, messageId, taskId: outcome.taskId, code: outcome.code },
      });
      if (outcome.systemMessage) {
        await this.publisher.emit({ type: 'message:new', workspaceId: member.workspaceId, rooms: [rooms.conversation(conversationId)], data: outcome.systemMessage });
      }
    }
    return { task: await this.tasks.detail(member, outcome.taskId), existing: outcome.existing };
  }

  private async inUnit(unit: Unit, member: MembershipContext, conversationId: string, messageId: string, body: ConvertMessageBody): Promise<Converted> {
    const { tx } = unit;
    const access = await loadConversation(tx, member, conversationId);
    const [message] = (
      await tx.execute<SourceRow>(sql`
        select id, kind, attachment_id, deleted_at is not null as deleted
        from messages
        where workspace_id = ${member.workspaceId} and conversation_id = ${conversationId} and id = ${messageId}
        for share`)
    ).rows;
    if (!message) throw ApiError.notFound('The message');
    if (message.deleted) throw new ApiError('MESSAGE_GONE');
    if (message.kind === 'system') throw new ApiError('MESSAGE_NOT_CONVERTIBLE');

    const linked = await this.linkedTask(tx, member, messageId);
    if (linked) return { taskId: linked, existing: true, code: null, systemMessage: null };

    const files = [...new Set(body.attachmentIds ?? [])];
    if (files.some((id) => id !== message.attachment_id)) {
      throw ApiError.validation([{ field: 'attachmentIds', message: "must be this message's own file" }]);
    }

    const taskId = await this.tasks.createIn(
      unit,
      member,
      {
        projectId: body.projectId,
        title: body.title,
        description: body.description ?? '',
        columnId: body.columnId ?? null,
        priority: body.priority,
        assigneeIds: body.assigneeIds,
        dueDate: body.dueDate ?? null,
        subtasks: body.subtasks,
      },
      { sourceMessageId: messageId, sourceAttachmentIds: files },
    );
    const [task] = (
      await tx.execute<{ code: string }>(sql`
        select p.key || '-' || t.number as code from tasks t join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
        where t.workspace_id = ${member.workspaceId} and t.id = ${taskId}`)
    ).rows;
    const code = task?.code ?? '';

    const systemMessage = access.conversation.kind !== 'direct' && (await this.announces(tx, member.workspaceId)) ? await this.systemLine(tx, member, conversationId, messageId, taskId, code) : null;

    await this.audit.write(tx, {
      action: 'task.create_from_message',
      workspaceId: member.workspaceId,
      resourceType: 'task',
      resourceId: taskId,
      changes: { after: { code, conversationId, messageId, attachmentIds: files } },
    });
    return { taskId, existing: false, code, systemMessage };
  }

  private async linkedTask(tx: Tx, member: MembershipContext, messageId: string): Promise<string | null> {
    const [row] = (
      await tx.execute<{ id: string }>(sql`
        select id from tasks where workspace_id = ${member.workspaceId} and source_message_id = ${messageId} and deleted_at is null limit 1`)
    ).rows;
    return row?.id ?? null;
  }

  private async announces(tx: Tx, workspaceId: string): Promise<boolean> {
    const [workspace] = await tx.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId));
    return workspace?.settings.systemMessageOnConvert ?? true;
  }

  /** «پیام به وظیفه … تبدیل شد»: the next `seq` of the conversation, written by the system. */
  private async systemLine(tx: Tx, member: MembershipContext, conversationId: string, messageId: string, taskId: string, code: string): Promise<MessageView> {
    const meta = { type: 'message_converted', params: { messageId, taskId, code, actorId: member.userId } };
    const [row] = (
      await tx.execute<{ id: string; seq: string | number; created_at: string }>(sql`
        with bumped as (
          update conversations set last_seq = last_seq + 1, last_message_at = now()
          where workspace_id = ${member.workspaceId} and id = ${conversationId}
          returning last_seq)
        insert into messages (workspace_id, conversation_id, seq, author_id, kind, body_meta)
        select ${member.workspaceId}, ${conversationId}, bumped.last_seq, null, 'system', ${JSON.stringify(meta)}::jsonb from bumped
        returning id, seq, created_at`)
    ).rows;
    if (!row) throw new Error('the system message was not written');
    return {
      id: row.id,
      conversationId,
      seq: Number(row.seq),
      authorId: null,
      kind: 'system',
      text: null,
      meta,
      attachment: null,
      replyToId: null,
      mentionIds: [],
      reactions: [],
      clientMsgId: null,
      editedAt: null,
      deleted: false,
      linkedTaskId: null,
      createdAt: iso(row.created_at),
    };
  }
}
