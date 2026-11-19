import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TaskDependencyView, WorklogList, WorklogView } from '@taskin/contracts';
import { Idempotent } from '../../platform/http/idempotency.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { Authenticated } from '../auth/guards.js';
import { CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { AgileService } from './agile.service.js';
import { CreateDependencyDto, CreateWorklogDto, TaskDependencyViewDto, WorklogListDto, WorklogViewDto } from './work.dto.js';

const UUID = new ParseUUIDPipe();

/**
 * Agile tracking on one task (worklogs and dependencies), addressed through its project. As with
 * the other task routes, project-level rules are checked in the use cases.
 */
@ApiTags('work')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId/projects/:projectId/tasks/:taskId')
export class AgileController {
  constructor(private readonly agile: AgileService) {}

  /* ----------------------------------------------------------- worklogs */

  @Get('worklogs')
  @ApiOperation({ summary: 'Time logged on the task, newest first, with the total and the estimate' })
  @ApiOkResponse({ type: WorklogListDto })
  worklogs(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string, @Param('taskId', UUID) taskId: string): Promise<WorklogList> {
    return this.agile.worklogs(member, projectId, taskId);
  }

  @Post('worklogs')
  @Idempotent()
  @ApiOperation({ summary: 'Log time spent on the task' })
  @ApiCreatedResponse({ type: WorklogViewDto })
  logWork(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('taskId', UUID) taskId: string,
    @Body() body: CreateWorklogDto,
  ): Promise<WorklogView> {
    return this.agile.logWork(member, projectId, taskId, body);
  }

  @Delete('worklogs/:worklogId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a worklog: one's own with edit, anyone's with delete" })
  @ApiNoContentResponse()
  removeWorklog(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('taskId', UUID) taskId: string,
    @Param('worklogId', UUID) worklogId: string,
  ): Promise<void> {
    return this.agile.removeWorklog(member, projectId, taskId, worklogId);
  }

  /* ----------------------------------------------------------- dependencies */

  @Get('dependencies')
  @ApiOperation({ summary: "The task's links to other tasks of the project, each from this task's side" })
  @ApiOkResponse({ type: TaskDependencyViewDto, isArray: true })
  dependencies(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('taskId', UUID) taskId: string,
  ): Promise<TaskDependencyView[]> {
    return this.agile.dependencies(member, projectId, taskId);
  }

  @Post('dependencies')
  @ApiOperation({ summary: 'Link the task to another of the project; blocking links may not form a cycle' })
  @ApiCreatedResponse({ type: TaskDependencyViewDto })
  link(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('taskId', UUID) taskId: string,
    @Body() body: CreateDependencyDto,
  ): Promise<TaskDependencyView> {
    return this.agile.link(member, projectId, taskId, body);
  }

  @Delete('dependencies/:dependencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unlink(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('taskId', UUID) taskId: string,
    @Param('dependencyId', UUID) dependencyId: string,
  ): Promise<void> {
    return this.agile.unlink(member, projectId, taskId, dependencyId);
  }
}
