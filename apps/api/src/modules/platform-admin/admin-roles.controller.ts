import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import type { AdministrativeUser } from '@taskin/contracts';
import { AssignAdminRoleDto, UpdateAdminRoleDto, AdministrativeUserDto } from './admin-roles.dto.js';
import { requireRole } from './admin-roles.guard.js';
import { AdminRolesService } from './admin-roles.service.js';
import { CurrentPlatformAdmin, type PlatformAdmin } from './platform-admin.guard.js';
import { NoStoreInterceptor } from './platform-admin.controller.js';
@ApiTags('platform-admin-roles')
@Controller('admin/users/roles')
@requireRole('SUPER_ADMIN')
@UseInterceptors(NoStoreInterceptor)
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}
  @Get() @ApiOkResponse({ type: AdministrativeUserDto, isArray: true }) @ApiOperation({ summary: 'List administrative users (SUPER_ADMIN only)' })
  list(@CurrentPlatformAdmin() admin: PlatformAdmin): Promise<AdministrativeUser[]> { return this.roles.list(admin); }
  @Post() @ApiCreatedResponse({ type: AdministrativeUserDto }) @ApiOperation({ summary: 'Provision or elevate an account, requiring phone, email and password setup' })
  assign(@CurrentPlatformAdmin() admin: PlatformAdmin, @Body() body: AssignAdminRoleDto): Promise<AdministrativeUser> { return this.roles.assign(admin, body); }
  @Patch(':id') @ApiOkResponse({ type: AdministrativeUserDto }) @ApiOperation({ summary: 'Change administrative role or suspend/resume access' })
  update(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAdminRoleDto): Promise<AdministrativeUser> { return this.roles.update(admin, id, body); }
  @Delete(':id') @HttpCode(204) @ApiOperation({ summary: 'Revoke administrative privileges and all existing sessions' })
  revoke(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string): Promise<void> { return this.roles.revoke(admin, id); }
}
