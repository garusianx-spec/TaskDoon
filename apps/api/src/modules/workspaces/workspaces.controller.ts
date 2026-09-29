import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AcceptInvitationResult,
  CreateInvitationsResult,
  DepartmentView,
  InvitationView,
  MemberView,
  MyPermissions,
  RoleView,
  UploadTicket,
  WorkspaceView,
} from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Idempotent } from '../../platform/http/idempotency.js';
import type { AuthPrincipal, MembershipContext } from '../../platform/http/request.js';
import { Authenticated, CurrentAuth, RequireStepUp } from '../auth/guards.js';
import type { AppAbility } from '../rbac/ability.js';
import { CheckPolicies, CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { RolesService } from '../rbac/roles.service.js';
import { DepartmentsService } from './departments.service.js';
import { IconsService } from './icons.service.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import {
  AcceptInvitationDto,
  AcceptInvitationResultDto,
  CreateDepartmentDto,
  CreateInvitationsDto,
  CreateInvitationsResultDto,
  CreateWorkspaceDto,
  DeleteWorkspaceDto,
  DepartmentViewDto,
  InvitationViewDto,
  MemberListQueryDto,
  MemberViewDto,
  MyPermissionsDto,
  RoleViewDto,
  TransferOwnershipDto,
  UpdateDepartmentDto,
  UpdateMemberDto,
  UpdatePresenceDto,
  UpdateRolePermissionsDto,
  UpdateWorkspaceDto,
  UploadTicketDto,
  WorkspaceViewDto,
} from './workspaces.dto.js';
import { WorkspacesService } from './workspaces.service.js';

const can =
  (action: Parameters<AppAbility['can']>[0], subject: Parameters<AppAbility['can']>[1]) =>
  (ability: AppAbility): boolean =>
    ability.can(action, subject);

/** Creating a workspace, and anything else not yet inside one. */
@ApiTags('workspaces')
@Authenticated()
@Controller()
export class WorkspaceEntryController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly icons: IconsService,
    private readonly invitations: InvitationsService,
  ) {}

  @Post('workspaces')
  @Idempotent()
  @ApiOperation({ summary: 'Create a workspace owned by the caller (needs an admin password)' })
  @ApiCreatedResponse({ type: WorkspaceViewDto })
  create(@CurrentAuth() principal: AuthPrincipal, @Body() body: CreateWorkspaceDto): Promise<WorkspaceView> {
    return this.workspaces.create(principal, body);
  }

  @Post('uploads/workspace-icon')
  @ApiOperation({ summary: 'A presigned upload for a workspace icon (PNG, JPEG or WebP, at most 1 MB)' })
  @ApiCreatedResponse({ type: UploadTicketDto })
  iconTicket(@CurrentAuth() principal: AuthPrincipal): Promise<UploadTicket> {
    return this.icons.ticket(principal.userId);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a workspace with an invitation link' })
  @ApiOkResponse({ type: AcceptInvitationResultDto })
  accept(@CurrentAuth() principal: AuthPrincipal, @Body() body: AcceptInvitationDto): Promise<AcceptInvitationResult> {
    return this.invitations.accept(principal, body.token);
  }
}

@ApiTags('workspaces')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId')
export class WorkspaceController {
  constructor(
    private readonly config: AppConfig,
    private readonly workspaces: WorkspacesService,
    private readonly members: MembersService,
    private readonly departments: DepartmentsService,
    private readonly invitations: InvitationsService,
    private readonly roles: RolesService,
  ) {}

  /* ----------------------------------------------------------- workspace */

  @Get()
  @ApiOkResponse({ type: WorkspaceViewDto })
  get(@CurrentMember() member: MembershipContext): Promise<WorkspaceView> {
    return this.workspaces.get(member);
  }

  @Patch()
  @ApiOkResponse({ type: WorkspaceViewDto })
  update(@CurrentMember() member: MembershipContext, @Body() body: UpdateWorkspaceDto): Promise<WorkspaceView> {
    return this.workspaces.update(member, body);
  }

  @Delete()
  @RequireStepUp()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the workspace (owner, step-up, exact name)' })
  @ApiNoContentResponse()
  remove(@CurrentMember() member: MembershipContext, @Body() body: DeleteWorkspaceDto): Promise<void> {
    return this.workspaces.remove(member, body.confirmName);
  }

  @Post('transfer-ownership')
  @RequireStepUp()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hand the workspace to another member (owner, step-up)' })
  transfer(@CurrentMember() member: MembershipContext, @Body() body: TransferOwnershipDto): Promise<void> {
    return this.workspaces.transferOwnership(member, body.userId);
  }

  /* ----------------------------------------------------------- me */

  @Get('me/permissions')
  @ApiOkResponse({ type: MyPermissionsDto })
  myPermissions(@CurrentMember() member: MembershipContext): MyPermissions {
    return this.roles.permissionsOf(member);
  }

  @Patch('me/presence')
  @HttpCode(HttpStatus.NO_CONTENT)
  presence(@CurrentMember() member: MembershipContext, @Body() body: UpdatePresenceDto): Promise<void> {
    return this.members.updatePresence(member, body);
  }

  /* ----------------------------------------------------------- members */

  @Get('members')
  @CheckPolicies(can('view', 'Member'))
  @ApiOkResponse({ type: MemberViewDto, isArray: true })
  listMembers(@CurrentMember() member: MembershipContext, @Query() query: MemberListQueryDto): Promise<MemberView[]> {
    return this.members.list(member, { includeFormer: query.includeFormer === true });
  }

  @Patch('members/:userId')
  @ApiOperation({ summary: 'Change a member (a role change needs a step-up)' })
  @ApiOkResponse({ type: MemberViewDto })
  updateMember(
    @CurrentAuth() principal: AuthPrincipal,
    @CurrentMember() member: MembershipContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateMemberDto,
  ): Promise<MemberView> {
    if (body.role !== undefined) this.assertSteppedUp(principal);
    return this.members.update(member, userId, body);
  }

  @Delete('members/:userId')
  @RequireStepUp()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@CurrentMember() member: MembershipContext, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.members.remove(member, userId);
  }

  /* ----------------------------------------------------------- departments */

  @Get('departments')
  @CheckPolicies(can('view', 'Department'))
  @ApiOkResponse({ type: DepartmentViewDto, isArray: true })
  listDepartments(@CurrentMember() member: MembershipContext): Promise<DepartmentView[]> {
    return this.departments.list(member);
  }

  @Post('departments')
  @CheckPolicies(can('create', 'Department'))
  @ApiCreatedResponse({ type: DepartmentViewDto })
  createDepartment(@CurrentMember() member: MembershipContext, @Body() body: CreateDepartmentDto): Promise<DepartmentView> {
    return this.departments.create(member, body);
  }

  @Patch('departments/:id')
  @CheckPolicies(can('edit', 'Department'))
  @ApiOkResponse({ type: DepartmentViewDto })
  updateDepartment(
    @CurrentMember() member: MembershipContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDepartmentDto,
  ): Promise<DepartmentView> {
    return this.departments.update(member, id, body);
  }

  @Delete('departments/:id')
  @CheckPolicies(can('delete', 'Department'))
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDepartment(@CurrentMember() member: MembershipContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.departments.remove(member, id);
  }

  /* ----------------------------------------------------------- invitations */

  @Get('invitations')
  @CheckPolicies(can('view', 'Invitation'))
  @ApiOkResponse({ type: InvitationViewDto, isArray: true })
  listInvitations(@CurrentMember() member: MembershipContext): Promise<InvitationView[]> {
    return this.invitations.listPending(member);
  }

  @Post('invitations')
  @Idempotent()
  @CheckPolicies(can('create', 'Invitation'))
  @ApiOperation({ summary: 'Invite by email or Iranian mobile; each entry is normalised and checked' })
  @ApiCreatedResponse({ type: CreateInvitationsResultDto })
  invite(@CurrentMember() member: MembershipContext, @Body() body: CreateInvitationsDto): Promise<CreateInvitationsResult> {
    return this.invitations.create(member, body);
  }

  @Delete('invitations/:id')
  @CheckPolicies(can('delete', 'Invitation'))
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(@CurrentMember() member: MembershipContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.invitations.revoke(member, id);
  }

  /* ----------------------------------------------------------- roles */

  @Get('roles')
  @CheckPolicies(can('view', 'Role'))
  @ApiOkResponse({ type: RoleViewDto, isArray: true })
  listRoles(@CurrentMember() member: MembershipContext): Promise<RoleView[]> {
    return this.roles.list(member);
  }

  @Put('roles/:roleId/permissions')
  @RequireStepUp()
  @CheckPolicies(can('edit', 'Role'))
  @ApiHeader({ name: 'If-Match', required: true, description: 'The role version being replaced' })
  @ApiOperation({ summary: 'Replace a role’s matrix row (step-up, If-Match, rank and no-escalation rules)' })
  @ApiOkResponse({ type: RoleViewDto })
  replacePermissions(
    @CurrentMember() member: MembershipContext,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: UpdateRolePermissionsDto,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<RoleView> {
    return this.roles.replace(member, roleId, body.permissions, ifMatch);
  }

  @Post('roles/reset-defaults')
  @RequireStepUp()
  @CheckPolicies(can('edit', 'Role'))
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RoleViewDto, isArray: true })
  resetRoles(@CurrentMember() member: MembershipContext): Promise<RoleView[]> {
    return this.roles.resetDefaults(member);
  }

  private assertSteppedUp(principal: AuthPrincipal): void {
    const age = Math.floor(Date.now() / 1000) - (principal.stepUpAt ?? 0);
    if (!principal.stepUpAt || age > this.config.env.STEP_UP_TTL_SECONDS) throw new ApiError('STEP_UP_REQUIRED');
  }
}
