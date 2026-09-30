import { Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import type { CreateDepartmentBody, DepartmentView, UpdateDepartmentBody } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { PG, isUniqueViolation, pgError } from '../../platform/db/pg-errors.js';
import { departments, workspaceMembers } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
  ) {}

  async list(member: MembershipContext): Promise<DepartmentView[]> {
    const rows = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx
        .select({ id: departments.id, name: departments.name, position: departments.position, memberCount: count(workspaceMembers.userId) })
        .from(departments)
        .leftJoin(
          workspaceMembers,
          and(eq(workspaceMembers.workspaceId, departments.workspaceId), eq(workspaceMembers.departmentId, departments.id), eq(workspaceMembers.status, 'active')),
        )
        .where(eq(departments.workspaceId, member.workspaceId))
        .groupBy(departments.id)
        .orderBy(asc(departments.position), asc(departments.name)),
    );
    return rows;
  }

  async create(member: MembershipContext, body: CreateDepartmentBody): Promise<DepartmentView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      try {
        const [created] = await tx.insert(departments).values({ workspaceId: member.workspaceId, name: body.name.trim() }).returning();
        if (!created) throw new Error('department insert returned nothing');
        await this.audit.write(tx, { action: 'department.create', workspaceId: member.workspaceId, resourceType: 'department', resourceId: created.id, changes: { after: { name: created.name } } });
        return { id: created.id, name: created.name, position: created.position, memberCount: 0 };
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError('CONFLICT', 'A department with that name exists.');
        throw error;
      }
    });
  }

  async update(member: MembershipContext, id: string, body: UpdateDepartmentBody): Promise<DepartmentView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      try {
        const [updated] = await tx
          .update(departments)
          .set({ ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.position !== undefined ? { position: body.position } : {}) })
          .where(and(eq(departments.workspaceId, member.workspaceId), eq(departments.id, id)))
          .returning();
        if (!updated) throw ApiError.notFound('The department');
        const [members] = await tx
          .select({ count: count() })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.departmentId, id), eq(workspaceMembers.status, 'active')));
        await this.audit.write(tx, { action: 'department.update', workspaceId: member.workspaceId, resourceType: 'department', resourceId: id, changes: { after: body } });
        return { id: updated.id, name: updated.name, position: updated.position, memberCount: members?.count ?? 0 };
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError('CONFLICT', 'A department with that name exists.');
        throw error;
      }
    });
  }

  /** Refused while any member or pending invitation still points at the department. */
  async remove(member: MembershipContext, id: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      try {
        const deleted = await tx
          .delete(departments)
          .where(and(eq(departments.workspaceId, member.workspaceId), eq(departments.id, id)))
          .returning({ id: departments.id, name: departments.name });
        if (deleted.length === 0) throw ApiError.notFound('The department');
        await this.audit.write(tx, { action: 'department.delete', workspaceId: member.workspaceId, resourceType: 'department', resourceId: id, changes: { before: { name: deleted[0]?.name } } });
      } catch (error) {
        const code = pgError(error)?.code;
        if (code === PG.restrictViolation || code === PG.foreignKeyViolation) throw new ApiError('DEPARTMENT_IN_USE');
        throw error;
      }
    });
  }
}
