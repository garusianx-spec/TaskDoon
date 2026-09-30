import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { messageGrant } from '../chat/chat-access.js';
import { projectVisibleSql } from '../work/access.js';

export interface Scope {
  /** The workspace room, one room per viewable project, one per conversation the member is in. */
  readonly rooms: readonly string[];
  /** Everyone active in the workspace, for the presence snapshot. */
  readonly memberIds: readonly string[];
}

/**
 * Which rooms a member's socket belongs in (RFC §4). The same visibility rules as the REST reads
 * (`projectVisibleSql`, conversation membership), so a socket never hears about what its user
 * could not fetch. Recomputed on subscribe and whenever permissions change.
 */
@Injectable()
export class RoomScope {
  constructor(private readonly uow: UnitOfWork) {}

  async of(member: MembershipContext): Promise<Scope> {
    const chat = messageGrant(member, 'view');
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<{ projects: string[] | null; conversations: string[] | null; members: string[] | null }>(sql`
        select
          array(select p.id from projects p where p.workspace_id = ${member.workspaceId} and ${projectVisibleSql(member)}) as projects,
          ${
            chat
              ? sql`array(select cm.conversation_id from conversation_members cm
                          join conversations c on c.workspace_id = cm.workspace_id and c.id = cm.conversation_id
                          where cm.workspace_id = ${member.workspaceId} and cm.user_id = ${member.userId}
                            and cm.left_at is null and c.archived_at is null)`
              : sql`'{}'::uuid[]`
          } as conversations,
          array(select m.user_id from workspace_members m where m.workspace_id = ${member.workspaceId} and m.status = 'active') as members`),
    );
    const row = result.rows[0];
    return {
      rooms: [
        rooms.workspace(member.workspaceId),
        ...(row?.projects ?? []).map((id) => rooms.project(id)),
        ...(row?.conversations ?? []).map((id) => rooms.conversation(id)),
      ],
      memberIds: row?.members ?? [],
    };
  }
}
