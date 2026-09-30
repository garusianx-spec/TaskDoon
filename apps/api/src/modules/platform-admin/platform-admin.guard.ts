import { applyDecorators, type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { users } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthenticatedRequest } from '../../platform/http/request.js';
import { RequireStepUp } from '../auth/guards.js';

/** The verified platform admin of this request. */
export interface PlatformAdmin {
  readonly userId: string;
  readonly fullName: string;
}

type AdminRequest = Request & AuthenticatedRequest & { platformAdmin?: PlatformAdmin };

/**
 * Lets through only accounts flagged `is_platform_admin` (and active). Read fresh on every
 * request, so taking the flag away works at once. Everyone else gets a 404: the admin surface
 * does not exist for them.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly uow: UnitOfWork) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<AdminRequest>();
    const auth = request.auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const [row] = await this.uow.run({ workspaceId: null, userId: auth.userId }, ({ tx }) =>
      tx
        .select({ fullName: users.fullName, isPlatformAdmin: users.isPlatformAdmin, status: users.status, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, auth.userId)),
    );
    if (!row?.isPlatformAdmin || row.status !== 'active' || row.deletedAt) throw ApiError.notFound('The page');
    request.platformAdmin = { userId: auth.userId, fullName: row.fullName };
    return true;
  }
}

/** Platform admin, and a password step-up within the last 15 minutes (checked in that order). */
export const PlatformAdminOnly = () => applyDecorators(ApiBearerAuth(), UseGuards(PlatformAdminGuard), RequireStepUp());

/** Platform admin, without the step-up: only the `/admin/me` probe. */
export const PlatformAdminProbe = () => applyDecorators(ApiBearerAuth(), UseGuards(PlatformAdminGuard));

export const CurrentPlatformAdmin = createParamDecorator((_: unknown, execution: ExecutionContext): PlatformAdmin => {
  const admin = execution.switchToHttp().getRequest<AdminRequest>().platformAdmin;
  if (!admin) throw new ApiError('UNAUTHENTICATED');
  return admin;
});
