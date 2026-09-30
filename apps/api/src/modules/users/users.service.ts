import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { MeResponse, MeUser, MeWorkspace, RoleId, UpdateMeBody } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { roles, users, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { StorageService } from '../../platform/storage/storage.js';

type UserRow = typeof users.$inferSelect;

export function toMeUser(user: UserRow): MeUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    avatarTone: user.avatarTone,
    locale: user.locale,
    timeZone: user.timeZone,
    hasPassword: user.passwordHash !== null,
  };
}

/** Icons shown in the switcher are signed for an hour; the page refetches /me well before that. */
export const ICON_URL_TTL_SECONDS = 3600;

@Injectable()
export class UsersService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly storage: StorageService,
  ) {}

  async findById(tx: Tx, userId: string): Promise<UserRow | undefined> {
    const [user] = await tx.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    return user;
  }

  async findByPhone(tx: Tx, phone: string): Promise<UserRow | undefined> {
    const [user] = await tx.select().from(users).where(and(eq(users.phone, phone), isNull(users.deletedAt)));
    return user;
  }

  /** The signed-in user and every workspace they belong to, in two statements. */
  async me(userId: string): Promise<MeResponse> {
    const { user, memberships } = await this.uow.run({ workspaceId: null, userId }, async ({ tx }) => {
      const user = await this.findById(tx, userId);
      if (!user) throw new ApiError('UNAUTHENTICATED');
      const memberships = await tx
        .select({
          id: workspaces.id,
          slug: workspaces.slug,
          name: workspaces.name,
          initials: workspaces.initials,
          tone: workspaces.tone,
          iconKey: workspaces.iconKey,
          ownerUserId: workspaces.ownerUserId,
          roleKey: roles.key,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .innerJoin(roles, and(eq(roles.workspaceId, workspaceMembers.workspaceId), eq(roles.id, workspaceMembers.roleId)))
        .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, 'active'), isNull(workspaces.deletedAt)))
        .orderBy(asc(workspaceMembers.joinedAt));
      return { user, memberships };
    });
    const list: MeWorkspace[] = await Promise.all(
      memberships.map(async (membership) => ({
        id: membership.id,
        slug: membership.slug,
        name: membership.name,
        initials: membership.initials,
        tone: membership.tone,
        iconUrl: membership.iconKey ? await this.storage.presignGet(membership.iconKey, ICON_URL_TTL_SECONDS) : null,
        role: membership.roleKey as RoleId,
        isOwner: membership.ownerUserId === userId,
      })),
    );
    return { user: toMeUser(user), workspaces: list };
  }

  async update(userId: string, patch: UpdateMeBody): Promise<MeUser> {
    return this.uow.run({ workspaceId: null, userId }, async ({ tx }) => {
      const before = await this.findById(tx, userId);
      if (!before) throw new ApiError('UNAUTHENTICATED');
      try {
        const [after] = await tx
          .update(users)
          .set({
            ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
            ...(patch.avatarTone !== undefined ? { avatarTone: patch.avatarTone } : {}),
            // A changed address is unverified until the verification flow (M4) confirms it.
            ...(patch.email !== undefined
              ? { email: patch.email?.trim().toLowerCase() ?? null, emailVerifiedAt: sql`case when ${users.email} is not distinct from ${patch.email?.trim().toLowerCase() ?? null} then ${users.emailVerifiedAt} else null end` }
              : {}),
          })
          .where(eq(users.id, userId))
          .returning();
        if (!after) throw new ApiError('UNAUTHENTICATED');
        await this.audit.write(tx, {
          action: 'user.profile.update',
          resourceType: 'user',
          resourceId: userId,
          changes: { before: { fullName: before.fullName, email: before.email, avatarTone: before.avatarTone }, after: patch },
        });
        return toMeUser(after);
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_uq')) throw new ApiError('CONFLICT', 'That email belongs to another account.');
        throw error;
      }
    });
  }
}
