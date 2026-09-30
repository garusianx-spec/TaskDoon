import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { CreateLabelBody, LabelView } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { labels } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';

/** Workspace-wide task labels (the boards module's `Label` subject). */
@Injectable()
export class LabelsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
  ) {}

  async list(member: MembershipContext): Promise<LabelView[]> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.select({ id: labels.id, name: labels.name, tone: labels.tone }).from(labels).where(eq(labels.workspaceId, member.workspaceId)).orderBy(asc(labels.name)),
    );
  }

  async create(member: MembershipContext, body: CreateLabelBody): Promise<LabelView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      try {
        const [row] = await tx
          .insert(labels)
          .values({ workspaceId: member.workspaceId, name: body.name.trim(), tone: body.tone ?? 'gray' })
          .returning({ id: labels.id, name: labels.name, tone: labels.tone });
        if (!row) throw new Error('label insert returned nothing');
        await this.audit.write(tx, { action: 'label.create', workspaceId: member.workspaceId, resourceType: 'label', resourceId: row.id, changes: { after: row } });
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError('CONFLICT', 'A label with that name exists.');
        throw error;
      }
    });
  }

  /** Removes the label from every task it was on. */
  async remove(member: MembershipContext, labelId: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const deleted = await tx
        .delete(labels)
        .where(and(eq(labels.workspaceId, member.workspaceId), eq(labels.id, labelId)))
        .returning({ name: labels.name });
      if (deleted.length === 0) throw ApiError.notFound('The label');
      await this.audit.write(tx, { action: 'label.delete', workspaceId: member.workspaceId, resourceType: 'label', resourceId: labelId, changes: { before: deleted[0] } });
    });
  }
}
