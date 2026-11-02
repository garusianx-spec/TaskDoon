import { applyDecorators, Injectable, SetMetadata, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformAdminRole } from '@taskin/contracts';
import { eq } from 'drizzle-orm';
import { users } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthenticatedRequest } from '../../platform/http/request.js';
import { platformRole } from '../../platform/security/platform-role-policy.js';
import { PlatformAdminOnly } from './platform-admin.guard.js';
const ROLE = 'platform.requiredRole';
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly uow: UnitOfWork) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const role = this.reflector.getAllAndOverride<PlatformAdminRole>(ROLE, [context.getHandler(), context.getClass()]);
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const [user] = await this.uow.run({ workspaceId: null, userId: auth.userId }, ({ tx }) => tx.select().from(users).where(eq(users.id, auth.userId)));
    if (!user || user.deletedAt || user.status !== 'active' || user.platformAdminStatus !== 'ACTIVE' || platformRole(user) !== role) throw ApiError.forbidden('A super administrator is required.');
    return true;
  }
}
export const requireRole = (role: PlatformAdminRole) => applyDecorators(PlatformAdminOnly(), SetMetadata(ROLE, role), UseGuards(PlatformRoleGuard));
