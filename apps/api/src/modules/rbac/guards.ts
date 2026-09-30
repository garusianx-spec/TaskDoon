import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiParam } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestContext } from '../../platform/context/request-context.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthenticatedRequest, MembershipContext } from '../../platform/http/request.js';
import { AbilityFactory, type AppAbility } from './ability.js';
import { MembershipService } from './membership.service.js';

type HttpRequest = Request & AuthenticatedRequest & { ability?: AppAbility };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves `:workspaceId` to the caller's membership. A non-member, a suspended member, or a
 * deleted workspace all answer 404, so guessing workspace ids reveals nothing.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    private readonly memberships: MembershipService,
    private readonly context: RequestContext,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<HttpRequest>();
    const raw = request.params.workspaceId;
    const workspaceId = typeof raw === 'string' ? raw : undefined;
    if (!request.auth) throw new ApiError('UNAUTHENTICATED');
    if (!workspaceId || !UUID.test(workspaceId)) throw ApiError.notFound('The workspace');
    const member = await this.memberships.load(workspaceId.toLowerCase(), request.auth.userId);
    if (!member) throw ApiError.notFound('The workspace');
    request.member = member;
    this.context.set('workspaceId', member.workspaceId);
    return true;
  }
}

/** For controllers under `/workspaces/:workspaceId`. */
export const WorkspaceScoped = () =>
  applyDecorators(ApiParam({ name: 'workspaceId', format: 'uuid' }), UseGuards(WorkspaceMemberGuard, PoliciesGuard));

export type PolicyCheck = (ability: AppAbility, member: MembershipContext) => boolean;

const POLICIES = Symbol('taskin:policies');

/**
 * Coarse, route-level permission checks (`can('create', 'Invitation')`). Fine checks that need
 * the loaded resource (rank rules, ownership) happen in the use case.
 */
export const CheckPolicies = (...checks: PolicyCheck[]) => SetMetadata(POLICIES, checks);

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilities: AbilityFactory,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const checks = this.reflector.getAllAndOverride<PolicyCheck[] | undefined>(POLICIES, [execution.getHandler(), execution.getClass()]);
    if (!checks?.length) return true;
    const request = execution.switchToHttp().getRequest<HttpRequest>();
    if (!request.member) throw new ApiError('FORBIDDEN');
    request.ability ??= this.abilities.forMember(request.member);
    if (!checks.every((check) => check(request.ability as AppAbility, request.member as MembershipContext))) {
      throw new ApiError('FORBIDDEN');
    }
    return true;
  }
}

/** The caller's membership in the route's workspace. */
export const CurrentMember = createParamDecorator((_: unknown, execution: ExecutionContext): MembershipContext => {
  const member = execution.switchToHttp().getRequest<HttpRequest>().member;
  if (!member) throw new ApiError('FORBIDDEN');
  return member;
});
