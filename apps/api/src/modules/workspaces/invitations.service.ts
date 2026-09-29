import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type {
  AcceptInvitationResult,
  CreateInvitationsBody,
  CreateInvitationsResult,
  InvitationChannel,
  InvitationRejection,
  InvitationView,
  RoleId,
} from '@taskin/contracts';
import { parseRecipient } from '@taskin/text';
import { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { randomToken, SecretBox, sha256 } from '../../platform/crypto/crypto.js';
import type { Tx } from '../../platform/db/database.js';
import { departments, invitations, roles, users, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthPrincipal, MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { toIranMobileE164 } from '../auth/otp.service.js';
import { AbilityFactory } from '../rbac/ability.js';
import { MembershipService } from '../rbac/membership.service.js';
import { DEPARTED_MEMBER_DAYS } from './members.service.js';

type InvitationRow = typeof invitations.$inferSelect;

interface Candidate {
  readonly raw: string;
  readonly channel: InvitationChannel;
  /** E.164 for SMS, lower-cased for email. */
  readonly address: string;
}

/**
 * Invitations by email or Iranian mobile (RFC §5.2 item 6). Each entry is classified and
 * normalised with the same rules as the web app; existing members and pending invitations are
 * detected on the normalised address. The link token is stored only as a hash and travels to the
 * sender sealed; seats are checked atomically when the invitation is accepted.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly config: AppConfig,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly abilities: AbilityFactory,
    private readonly memberships: MembershipService,
    private readonly box: SecretBox,
  ) {}

  async create(actor: MembershipContext, body: CreateInvitationsBody): Promise<CreateInvitationsResult> {
    if (!this.abilities.forMember(actor).can('create', 'Invitation')) throw ApiError.forbidden();
    if (body.role === 'owner') throw new ApiError('OWNER_IMMUTABLE', 'Nobody can be invited as the owner.');

    const rejected: { address: string; reason: InvitationRejection }[] = [];
    const candidates: Candidate[] = [];
    for (const recipient of body.recipients) {
      const candidate = this.classify(recipient.address, recipient.channel);
      if (!candidate) rejected.push({ address: recipient.address, reason: 'invalid_address' });
      else if (!candidates.some((c) => c.channel === candidate.channel && c.address === candidate.address)) candidates.push(candidate);
    }

    return this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async (unit) => {
      const { tx } = unit;
      const [role] = await tx.select().from(roles).where(and(eq(roles.workspaceId, actor.workspaceId), eq(roles.key, body.role)));
      if (!role) throw ApiError.validation([{ field: 'role', message: 'unknown role' }]);
      if (!actor.isOwner && role.rank <= actor.rank) throw new ApiError('ROLE_RANK_VIOLATION');
      if (body.departmentId) {
        const [department] = await tx
          .select({ id: departments.id })
          .from(departments)
          .where(and(eq(departments.workspaceId, actor.workspaceId), eq(departments.id, body.departmentId)));
        if (!department) throw ApiError.validation([{ field: 'departmentId', message: 'unknown department' }]);
      }
      const [workspace] = await tx
        .select({ name: workspaces.name, settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, actor.workspaceId));
      if (!workspace) throw ApiError.notFound('The workspace');

      // Lapsed invitations no longer block a new one to the same address.
      await tx
        .update(invitations)
        .set({ status: 'expired' })
        .where(and(eq(invitations.workspaceId, actor.workspaceId), eq(invitations.status, 'pending'), lt(invitations.expiresAt, sql`now()`)));

      const members = await this.existingMembers(tx, actor.workspaceId, candidates);
      const pending = await tx
        .select({ channel: invitations.channel, address: invitations.address })
        .from(invitations)
        .where(
          and(
            eq(invitations.workspaceId, actor.workspaceId),
            eq(invitations.status, 'pending'),
            inArray(invitations.address, candidates.map((c) => c.address).concat([''])),
          ),
        );
      const allowedDomains = workspace.settings.allowedEmailDomains.map((domain) => domain.toLowerCase());

      const accepted: Candidate[] = [];
      for (const candidate of candidates) {
        if (members.has(candidate.address)) rejected.push({ address: candidate.raw, reason: 'already_member' });
        else if (pending.some((p) => p.channel === candidate.channel && p.address === candidate.address)) {
          rejected.push({ address: candidate.raw, reason: 'already_invited' });
        } else if (
          candidate.channel === 'email' &&
          allowedDomains.length > 0 &&
          !allowedDomains.includes(candidate.address.split('@')[1] ?? '')
        ) {
          rejected.push({ address: candidate.raw, reason: 'domain_not_allowed' });
        } else accepted.push(candidate);
      }

      const created: InvitationView[] = [];
      for (const candidate of accepted) {
        const token = randomToken(32);
        const [row] = await tx
          .insert(invitations)
          .values({
            workspaceId: actor.workspaceId,
            channel: candidate.channel,
            address: candidate.address,
            roleId: role.id,
            departmentId: body.departmentId ?? null,
            message: body.message?.trim() ?? '',
            tokenHash: sha256(token),
            invitedBy: actor.userId,
            expiresAt: sql`now() + make_interval(days => ${this.config.env.INVITATION_TTL_DAYS})`,
          })
          .returning();
        if (!row) throw new Error('invitation insert returned nothing');
        const link = this.box.seal(`${new URL('/invite', this.config.env.PUBLIC_WEB_ORIGIN).toString()}?token=${token}`);
        await this.outbox.add(
          tx,
          candidate.channel === 'sms'
            ? {
                type: 'notification.sms',
                aggregateType: 'invitation',
                aggregateId: row.id,
                workspaceId: actor.workspaceId,
                payload: { to: candidate.address, template: 'invite', tokens: { workspace: workspace.name, link }, sealed: ['link'] },
              }
            : {
                type: 'notification.email',
                aggregateType: 'invitation',
                aggregateId: row.id,
                workspaceId: actor.workspaceId,
                payload: { to: candidate.address, template: 'invite', params: { workspace: workspace.name, link, message: row.message }, sealed: ['link'] },
              },
        );
        created.push(this.view(row, role.key as RoleId));
      }
      if (created.length > 0) {
        await this.audit.write(tx, {
          action: 'invitation.create',
          workspaceId: actor.workspaceId,
          resourceType: 'invitation',
          resourceId: created.map((invitation) => invitation.id).join(','),
          changes: { role: body.role, addresses: created.map((invitation) => invitation.address) },
        });
      }
      return { created, rejected };
    });
  }

  async listPending(member: MembershipContext): Promise<InvitationView[]> {
    const rows = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx
        .select({ invitation: invitations, roleKey: roles.key })
        .from(invitations)
        .innerJoin(roles, and(eq(roles.workspaceId, invitations.workspaceId), eq(roles.id, invitations.roleId)))
        .where(and(eq(invitations.workspaceId, member.workspaceId), eq(invitations.status, 'pending'), sql`${invitations.expiresAt} > now()`))
        .orderBy(desc(invitations.createdAt)),
    );
    return rows.map(({ invitation, roleKey }) => this.view(invitation, roleKey as RoleId));
  }

  async revoke(actor: MembershipContext, invitationId: string): Promise<void> {
    if (!this.abilities.forMember(actor).can('delete', 'Invitation')) throw ApiError.forbidden();
    await this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async ({ tx }) => {
      const revoked = await tx
        .update(invitations)
        .set({ status: 'revoked' })
        .where(and(eq(invitations.workspaceId, actor.workspaceId), eq(invitations.id, invitationId), eq(invitations.status, 'pending')))
        .returning({ id: invitations.id });
      if (revoked.length === 0) throw ApiError.notFound('The invitation');
      await this.audit.write(tx, { action: 'invitation.revoke', workspaceId: actor.workspaceId, resourceType: 'invitation', resourceId: invitationId });
    });
  }

  /**
   * Joins the workspace. An SMS invitation only works for the number it was sent to; an email
   * invitation works for whoever holds the link. The seat is taken atomically against the plan.
   */
  async accept(principal: AuthPrincipal, token: string): Promise<AcceptInvitationResult> {
    const tokenHash = sha256(token);
    const found = await this.uow.run({ workspaceId: null, userId: principal.userId }, ({ tx }) =>
      tx.execute<{ workspace_id: string; invitation_id: string }>(sql`select workspace_id, invitation_id from app.find_invitation(${tokenHash})`),
    );
    const location = found.rows[0];
    if (!location) throw new ApiError('INVITATION_INVALID');

    return this.uow.run({ workspaceId: location.workspace_id, userId: principal.userId }, async (unit) => {
      const { tx } = unit;
      const [row] = await tx
        .select({
          invitation: invitations,
          roleKey: roles.key,
          expired: sql<boolean>`${invitations.expiresAt} <= now()`,
          deleted: sql<boolean>`${workspaces.deletedAt} is not null`,
        })
        .from(invitations)
        .innerJoin(roles, and(eq(roles.workspaceId, invitations.workspaceId), eq(roles.id, invitations.roleId)))
        .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
        .where(eq(invitations.id, location.invitation_id))
        .for('update', { of: invitations });
      if (!row || row.invitation.status !== 'pending' || row.expired || row.deleted) throw new ApiError('INVITATION_INVALID');
      const { invitation } = row;

      const [user] = await tx.select().from(users).where(and(eq(users.id, principal.userId), isNull(users.deletedAt)));
      if (!user) throw new ApiError('UNAUTHENTICATED');
      if (invitation.channel === 'sms' && user.phone !== invitation.address) throw new ApiError('INVITATION_ADDRESS_MISMATCH');

      const [existing] = await tx
        .select({ status: workspaceMembers.status })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, invitation.workspaceId), eq(workspaceMembers.userId, user.id)));
      if (existing && existing.status !== 'left') throw new ApiError('ALREADY_MEMBER');

      const seat = await tx.execute(sql`
        update workspaces w set member_count = w.member_count + 1
        from plans p
        where w.id = ${invitation.workspaceId} and p.id = w.plan_id
          and w.member_count < (p.limits ->> 'maxMembers')::int
        returning w.member_count`);
      if (seat.rows.length === 0) throw new ApiError('PLAN_LIMIT_REACHED', 'The workspace has no free seats.');

      // Back within 40 days of being removed: the conversations the removal closed (in the same
      // transaction, so at the same instant) open again. Their project memberships never went.
      const rejoined = existing
        ? await tx.execute<{ conversation_id: string; role: string }>(sql`
            update conversation_members cm set left_at = null, hidden_at = null
            from workspace_members m, conversations c
            where m.workspace_id = ${invitation.workspaceId} and m.user_id = ${user.id} and m.status = 'left'
              and m.left_at > now() - make_interval(days => ${DEPARTED_MEMBER_DAYS})
              and cm.workspace_id = m.workspace_id and cm.user_id = m.user_id and cm.left_at = m.left_at
              and c.workspace_id = cm.workspace_id and c.id = cm.conversation_id and c.archived_at is null
            returning cm.conversation_id, cm.role`)
        : { rows: [] };
      const membership = {
        roleId: invitation.roleId,
        departmentId: invitation.departmentId,
        status: 'active' as const,
        invitedBy: invitation.invitedBy,
        joinedAt: sql`now()`,
        leftAt: null,
      };
      if (existing) {
        await tx
          .update(workspaceMembers)
          .set(membership)
          .where(and(eq(workspaceMembers.workspaceId, invitation.workspaceId), eq(workspaceMembers.userId, user.id)));
      } else {
        await tx.insert(workspaceMembers).values({ workspaceId: invitation.workspaceId, userId: user.id, ...membership });
      }
      await tx
        .update(invitations)
        .set({ status: 'accepted', acceptedBy: user.id, acceptedAt: sql`now()` })
        .where(eq(invitations.id, invitation.id));
      await this.memberships.bump(unit, invitation.workspaceId);
      await this.audit.write(tx, {
        action: 'invitation.accept',
        workspaceId: invitation.workspaceId,
        resourceType: 'invitation',
        resourceId: invitation.id,
        changes: { role: row.roleKey, channel: invitation.channel },
      });
      for (const { conversation_id: conversationId, role } of rejoined.rows) {
        await this.outbox.add(tx, {
          type: 'conversation.member.added',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          workspaceId: invitation.workspaceId,
          payload: { conversationId, userId: user.id, role },
        });
      }
      await this.outbox.add(tx, {
        type: 'member.joined',
        aggregateType: 'workspace',
        aggregateId: invitation.workspaceId,
        workspaceId: invitation.workspaceId,
        payload: { workspaceId: invitation.workspaceId, userId: user.id },
      });
      return { workspaceId: invitation.workspaceId, role: row.roleKey as RoleId };
    });
  }

  private classify(raw: string, channel: InvitationChannel | undefined): Candidate | null {
    const parsed = parseRecipient(raw);
    if (!parsed.ok) return null;
    if (channel && parsed.recipient.channel !== channel) return null;
    if (parsed.recipient.channel === 'sms') {
      const e164 = toIranMobileE164(parsed.recipient.address);
      return e164 ? { raw, channel: 'sms', address: e164 } : null;
    }
    return { raw, channel: 'email', address: parsed.recipient.address.toLowerCase() };
  }

  /** Normalised addresses (phones and emails) that already belong to active or suspended members. */
  private async existingMembers(tx: Tx, workspaceId: string, candidates: readonly Candidate[]): Promise<Set<string>> {
    const phones = candidates.filter((c) => c.channel === 'sms').map((c) => c.address);
    const emails = candidates.filter((c) => c.channel === 'email').map((c) => c.address);
    if (phones.length === 0 && emails.length === 0) return new Set();
    const rows = await tx
      .select({ phone: users.phone, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.status, ['active', 'suspended']),
          or(
            phones.length > 0 ? inArray(users.phone, phones) : undefined,
            emails.length > 0 ? inArray(users.email, emails) : undefined,
          ),
        ),
      );
    return new Set(rows.flatMap((row) => [row.phone, ...(row.email ? [row.email.toLowerCase()] : [])]));
  }

  private view(row: InvitationRow, role: RoleId): InvitationView {
    return {
      id: row.id,
      address: row.address,
      channel: row.channel,
      role,
      departmentId: row.departmentId,
      message: row.message,
      status: row.status,
      invitedById: row.invitedBy,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
