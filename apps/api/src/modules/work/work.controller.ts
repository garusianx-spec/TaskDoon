import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  BoardView,
  LabelView,
  ProjectMemberView,
  ProjectView,
  SubtaskView,
  TaskCard,
  TaskCommentView,
  TaskDetail,
  TaskPage,
  TaskPreview,
  WorkflowView,
} from '@taskin/contracts';
import { requireIfMatch } from '../../platform/http/api-error.js';
import { Idempotent } from '../../platform/http/idempotency.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { Authenticated } from '../auth/guards.js';
import type { AppAbility } from '../rbac/ability.js';
import { CheckPolicies, CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { BoardService } from './board.service.js';
import { LabelsService } from './labels.service.js';
import { ProjectsService } from './projects.service.js';
import { TasksService } from './tasks.service.js';
import {
  AttachFileDto,
  BoardQueryDto,
  BoardViewDto,
  CompleteTaskDto,
  CreateColumnDto,
  CreateCommentDto,
  CreateLabelDto,
  CreateProjectDto,
  CreateSubtaskDto,
  CreateTaskDto,
  DeleteColumnDto,
  GanttQueryDto,
  LabelViewDto,
  MoveTaskDto,
  ProjectMemberViewDto,
  ProjectViewDto,
  PutProjectMemberDto,
  SubtaskViewDto,
  TaskCardDto,
  TaskCommentViewDto,
  TaskDetailDto,
  TaskListQueryDto,
  TaskPageDto,
  TaskPreviewDto,
  UpdateColumnDto,
  UpdateCommentDto,
  UpdateProjectDto,
  UpdateSubtaskDto,
  MoveSubtaskDto,
  UpdateTaskDto,
  WorkflowQueryDto,
  WorkflowViewDto,
} from './work.dto.js';

const can =
  (action: Parameters<AppAbility['can']>[0], subject: Parameters<AppAbility['can']>[1]) =>
  (ability: AppAbility): boolean =>
    ability.can(action, subject);

const UUID = new ParseUUIDPipe();

/**
 * Projects, the board and tasks (RFC §12). Route guards check membership and coarse matrix
 * grants; project-level rules (roles, visibility, rank) are checked in the use cases, where the
 * project is loaded.
 */
@ApiTags('work')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId')
export class WorkController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly board: BoardService,
    private readonly tasks: TasksService,
    private readonly labels: LabelsService,
  ) {}

  /* ----------------------------------------------------------- projects */

  @Get('projects')
  @ApiOkResponse({ type: ProjectViewDto, isArray: true })
  listProjects(@CurrentMember() member: MembershipContext): Promise<ProjectView[]> {
    return this.projects.list(member);
  }

  @Post('projects')
  @Idempotent()
  @CheckPolicies(can('create', 'Project'))
  @ApiCreatedResponse({ type: ProjectViewDto })
  createProject(@CurrentMember() member: MembershipContext, @Body() body: CreateProjectDto): Promise<ProjectView> {
    return this.projects.create(member, body);
  }

  @Get('projects/:projectId')
  @ApiOkResponse({ type: ProjectViewDto })
  getProject(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string): Promise<ProjectView> {
    return this.projects.get(member, projectId);
  }

  @Patch('projects/:projectId')
  @ApiOperation({ summary: 'Change a project (visibility needs the delete permission)' })
  @ApiOkResponse({ type: ProjectViewDto })
  updateProject(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string, @Body() body: UpdateProjectDto): Promise<ProjectView> {
    return this.projects.update(member, projectId, body);
  }

  @Delete('projects/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeProject(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string): Promise<void> {
    return this.projects.remove(member, projectId);
  }

  @Get('projects/:projectId/members')
  @ApiOkResponse({ type: ProjectMemberViewDto, isArray: true })
  projectMembers(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string): Promise<ProjectMemberView[]> {
    return this.projects.members(member, projectId);
  }

  @Put('projects/:projectId/members/:userId')
  @ApiOperation({ summary: 'Add a project member or change their role (never above your own)' })
  @ApiOkResponse({ type: ProjectMemberViewDto })
  putProjectMember(
    @CurrentMember() member: MembershipContext,
    @Param('projectId', UUID) projectId: string,
    @Param('userId', UUID) userId: string,
    @Body() body: PutProjectMemberDto,
  ): Promise<ProjectMemberView> {
    return this.projects.putMember(member, projectId, userId, body.role);
  }

  @Delete('projects/:projectId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeProjectMember(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string, @Param('userId', UUID) userId: string): Promise<void> {
    return this.projects.removeMember(member, projectId, userId);
  }

  @Put('projects/:projectId/star')
  @HttpCode(HttpStatus.NO_CONTENT)
  starProject(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string): Promise<void> {
    return this.projects.star(member, projectId, true);
  }

  @Delete('projects/:projectId/star')
  @HttpCode(HttpStatus.NO_CONTENT)
  unstarProject(@CurrentMember() member: MembershipContext, @Param('projectId', UUID) projectId: string): Promise<void> {
    return this.projects.star(member, projectId, false);
  }

  /* ----------------------------------------------------------- workflow */

  @Get('workflow')
  @ApiOperation({ summary: 'A project board’s columns (every project has its own workflow)' })
  @ApiOkResponse({ type: WorkflowViewDto })
  workflow(@CurrentMember() member: MembershipContext, @Query() query: WorkflowQueryDto): Promise<WorkflowView> {
    return this.board.workflow(member, query.projectId);
  }

  @Get('workflows')
  @ApiOperation({ summary: 'The columns of every project the caller can see' })
  @ApiOkResponse({ type: WorkflowViewDto, isArray: true })
  workflows(@CurrentMember() member: MembershipContext): Promise<WorkflowView[]> {
    return this.board.workflows(member);
  }

  @Post('workflow/columns')
  @Idempotent()
  @CheckPolicies(can('create', 'BoardColumn'))
  @ApiCreatedResponse({ type: WorkflowViewDto })
  addColumn(@CurrentMember() member: MembershipContext, @Body() body: CreateColumnDto): Promise<WorkflowView> {
    return this.board.addColumn(member, body);
  }

  @Patch('workflow/columns/:columnId')
  @CheckPolicies(can('edit', 'BoardColumn'))
  @ApiOperation({ summary: 'Rename, recolour or reorder a column' })
  @ApiOkResponse({ type: WorkflowViewDto })
  updateColumn(@CurrentMember() member: MembershipContext, @Param('columnId', UUID) columnId: string, @Body() body: UpdateColumnDto): Promise<WorkflowView> {
    return this.board.updateColumn(member, columnId, body);
  }

  @Delete('workflow/columns/:columnId')
  @CheckPolicies(can('delete', 'BoardColumn'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a column, migrating or archiving its cards' })
  removeColumn(@CurrentMember() member: MembershipContext, @Param('columnId', UUID) columnId: string, @Body() body: DeleteColumnDto): Promise<void> {
    return this.board.removeColumn(member, columnId, body.toDisposition());
  }

  @Get('board')
  @ApiOperation({ summary: 'A project board: the columns and every visible card of the project and its sub-projects' })
  @ApiOkResponse({ type: BoardViewDto })
  boardView(@CurrentMember() member: MembershipContext, @Query() query: BoardQueryDto): Promise<BoardView> {
    return this.tasks.boardView(member, query.projectId);
  }

  /* ----------------------------------------------------------- labels */

  @Get('labels')
  @ApiOkResponse({ type: LabelViewDto, isArray: true })
  listLabels(@CurrentMember() member: MembershipContext): Promise<LabelView[]> {
    return this.labels.list(member);
  }

  @Post('labels')
  @CheckPolicies(can('create', 'Label'))
  @ApiCreatedResponse({ type: LabelViewDto })
  createLabel(@CurrentMember() member: MembershipContext, @Body() body: CreateLabelDto): Promise<LabelView> {
    return this.labels.create(member, body);
  }

  @Delete('labels/:labelId')
  @CheckPolicies(can('delete', 'Label'))
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLabel(@CurrentMember() member: MembershipContext, @Param('labelId', UUID) labelId: string): Promise<void> {
    return this.labels.remove(member, labelId);
  }

  /* ----------------------------------------------------------- tasks */

  @Get('tasks')
  @ApiOperation({ summary: 'A page of cards: smart views (my tasks, starred, due soon), filters and Persian search' })
  @ApiOkResponse({ type: TaskPageDto })
  listTasks(@CurrentMember() member: MembershipContext, @Query() query: TaskListQueryDto): Promise<TaskPage> {
    return this.tasks.list(member, {
      smart: query.smart ?? 'all',
      projectId: query.projectId,
      status: query.status,
      assigneeId: query.assigneeId,
      q: query.q,
      includeArchived: query.includeArchived,
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });
  }

  @Get('tasks/gantt')
  @ApiOperation({ summary: 'Cards whose start-to-due span overlaps a date range' })
  @ApiOkResponse({ type: TaskCardDto, isArray: true })
  gantt(@CurrentMember() member: MembershipContext, @Query() query: GanttQueryDto): Promise<TaskCard[]> {
    return this.tasks.gantt(member, { projectId: query.projectId, from: query.from, to: query.to });
  }

  // No route-level matrix check: a project role can widen the workspace role (a guest who
  // contributes to a project may create tasks there). The use case checks the project.
  @Post('tasks')
  @Idempotent()
  @ApiCreatedResponse({ type: TaskDetailDto })
  createTask(@CurrentMember() member: MembershipContext, @Body() body: CreateTaskDto): Promise<TaskDetail> {
    return this.tasks.create(member, body);
  }

  @Get('tasks/:taskId')
  @ApiOkResponse({ type: TaskDetailDto })
  getTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string): Promise<TaskDetail> {
    return this.tasks.detail(member, taskId);
  }

  @Patch('tasks/:taskId')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The task version being changed' })
  @ApiOperation({ summary: 'Change a task (If-Match; assignees and reviewer need assign, the rest edit)' })
  @ApiOkResponse({ type: TaskDetailDto })
  updateTask(
    @CurrentMember() member: MembershipContext,
    @Param('taskId', UUID) taskId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.update(member, taskId, requireIfMatch(ifMatch), body);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string): Promise<void> {
    return this.tasks.remove(member, taskId);
  }

  @Post('tasks/:taskId/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a card to a column, between two neighbours' })
  @ApiOkResponse({ type: TaskCardDto })
  moveTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Body() body: MoveTaskDto): Promise<TaskCard> {
    return this.tasks.move(member, taskId, body);
  }

  @Post('tasks/:taskId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quick-complete or reopen a card' })
  @ApiOkResponse({ type: TaskCardDto })
  completeTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Body() body: CompleteTaskDto): Promise<TaskCard> {
    return this.tasks.complete(member, taskId, body);
  }

  @Get('tasks/:taskId/preview')
  @ApiOperation({ summary: 'What anyone in the workspace may know of a task: its code, and more with access' })
  @ApiOkResponse({ type: TaskPreviewDto })
  previewTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string): Promise<TaskPreview> {
    return this.tasks.preview(member, taskId);
  }

  @Put('tasks/:taskId/star')
  @HttpCode(HttpStatus.NO_CONTENT)
  starTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string): Promise<void> {
    return this.tasks.star(member, taskId, true);
  }

  @Delete('tasks/:taskId/star')
  @HttpCode(HttpStatus.NO_CONTENT)
  unstarTask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string): Promise<void> {
    return this.tasks.star(member, taskId, false);
  }

  @Post('tasks/:taskId/subtasks')
  @ApiCreatedResponse({ type: SubtaskViewDto })
  addSubtask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Body() body: CreateSubtaskDto): Promise<SubtaskView> {
    return this.tasks.addSubtask(member, taskId, body);
  }

  @Patch('tasks/:taskId/subtasks/:subtaskId')
  @ApiOkResponse({ type: SubtaskViewDto })
  updateSubtask(
    @CurrentMember() member: MembershipContext,
    @Param('taskId', UUID) taskId: string,
    @Param('subtaskId', UUID) subtaskId: string,
    @Body() body: UpdateSubtaskDto,
  ): Promise<SubtaskView> {
    return this.tasks.updateSubtask(member, taskId, subtaskId, body);
  }

  @Post('tasks/:taskId/subtasks/:subtaskId/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder a subtask among its siblings (drag and drop): name its new neighbours' })
  @ApiOkResponse({ type: SubtaskViewDto })
  moveSubtask(
    @CurrentMember() member: MembershipContext,
    @Param('taskId', UUID) taskId: string,
    @Param('subtaskId', UUID) subtaskId: string,
    @Body() body: MoveSubtaskDto,
  ): Promise<SubtaskView> {
    return this.tasks.moveSubtask(member, taskId, subtaskId, body);
  }

  @Delete('tasks/:taskId/subtasks/:subtaskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSubtask(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Param('subtaskId', UUID) subtaskId: string): Promise<void> {
    return this.tasks.removeSubtask(member, taskId, subtaskId);
  }

  @Post('tasks/:taskId/comments')
  @ApiCreatedResponse({ type: TaskCommentViewDto })
  addComment(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Body() body: CreateCommentDto): Promise<TaskCommentView> {
    return this.tasks.addComment(member, taskId, body);
  }

  @Patch('tasks/:taskId/comments/:commentId')
  @ApiOkResponse({ type: TaskCommentViewDto })
  updateComment(
    @CurrentMember() member: MembershipContext,
    @Param('taskId', UUID) taskId: string,
    @Param('commentId', UUID) commentId: string,
    @Body() body: UpdateCommentDto,
  ): Promise<TaskCommentView> {
    return this.tasks.updateComment(member, taskId, commentId, body.body);
  }

  @Delete('tasks/:taskId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Param('commentId', UUID) commentId: string): Promise<void> {
    return this.tasks.removeComment(member, taskId, commentId);
  }

  @Post('tasks/:taskId/attachments')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Link one of your completed uploads to the task' })
  attach(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Body() body: AttachFileDto): Promise<void> {
    return this.tasks.attach(member, taskId, body.attachmentId);
  }

  @Delete('tasks/:taskId/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(@CurrentMember() member: MembershipContext, @Param('taskId', UUID) taskId: string, @Param('attachmentId', UUID) attachmentId: string): Promise<void> {
    return this.tasks.detach(member, taskId, attachmentId);
  }
}
