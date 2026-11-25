import {
  applyDecorators,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
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
  constructor(
    private readonly reflector: Reflector,
    private readonly uow: UnitOfWork,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roleMeta = this.reflector.getAllAndOverride<PlatformAdminRole | readonly PlatformAdminRole[]>(ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roleMeta) return true;
    const allowed = Array.isArray(roleMeta) ? roleMeta : [roleMeta];
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const [user] = await this.uow.run({ workspaceId: null, userId: auth.userId }, ({ tx }) =>
      tx.select().from(users).where(eq(users.id, auth.userId)),
    );
    const userRole = user ? platformRole(user) : null;
    if (
      !user ||
      user.deletedAt ||
      user.status !== 'active' ||
      user.platformAdminStatus !== 'ACTIVE' ||
      !userRole ||
      !allowed.includes(userRole)
    )
      throw ApiError.forbidden(
        allowed.length === 1 && allowed.includes('SUPER_ADMIN')
          ? 'A super administrator is required.'
          : 'Higher platform administrative privileges are required.',
      );
    return true;
  }
}
export const requireRole = (...roles: PlatformAdminRole[]) =>
  applyDecorators(
    PlatformAdminOnly(),
    SetMetadata(ROLE, roles.length === 1 ? roles[0] : roles),
    UseGuards(PlatformRoleGuard),
  );
