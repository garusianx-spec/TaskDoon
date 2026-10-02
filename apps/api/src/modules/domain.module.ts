import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service.js';
import { CsrfGuard, JwtAuthGuard, StepUpGuard } from './auth/guards.js';
import { OtpService } from './auth/otp.service.js';
import { PasswordService } from './auth/password.service.js';
import { RevocationService } from './auth/revocation.service.js';
import { SessionService } from './auth/session.service.js';
import { TokenService } from './auth/token.service.js';
import { AbilityFactory } from './rbac/ability.js';
import { PoliciesGuard, WorkspaceMemberGuard } from './rbac/guards.js';
import { MembershipService } from './rbac/membership.service.js';
import { RolesService } from './rbac/roles.service.js';
import { UsersService } from './users/users.service.js';
import { DepartmentsService } from './workspaces/departments.service.js';
import { IconsService } from './workspaces/icons.service.js';
import { InvitationsService } from './workspaces/invitations.service.js';
import { MembersService } from './workspaces/members.service.js';
import { WorkspacesService } from './workspaces/workspaces.service.js';
import { ConversationsService } from './chat/conversations.service.js';
import { MessagesService } from './chat/messages.service.js';
import { AutoReplyService } from './chat/auto-reply.service.js';
import { ScheduledMessagesService } from './chat/scheduled-messages.service.js';
import { MessageTasksService } from './bridges/message-tasks.service.js';
import { CalendarService } from './content/calendar.service.js';
import { FeedService } from './content/feed.service.js';
import { FilesService } from './content/files.service.js';
import { NotesService } from './content/notes.service.js';
import { ReportsService } from './content/reports.service.js';
import { AccessService } from './work/access.js';
import { AgileService } from './work/agile.service.js';
import { BoardService } from './work/board.service.js';
import { LabelsService } from './work/labels.service.js';
import { ProjectsService } from './work/projects.service.js';
import { TasksService } from './work/tasks.service.js';

const services = [
  // auth
  TokenService,
  RevocationService,
  SessionService,
  OtpService,
  PasswordService,
  AuthService,
  JwtAuthGuard,
  StepUpGuard,
  CsrfGuard,
  // users
  UsersService,
  // rbac
  AbilityFactory,
  MembershipService,
  RolesService,
  WorkspaceMemberGuard,
  PoliciesGuard,
  // workspaces
  IconsService,
  WorkspacesService,
  MembersService,
  DepartmentsService,
  InvitationsService,
  // work: projects, board, tasks
  AccessService,
  ProjectsService,
  BoardService,
  TasksService,
  LabelsService,
  AgileService,
  // content: files, notes, calendar, feed, reports
  FilesService,
  NotesService,
  FeedService,
  CalendarService,
  ReportsService,
  // chat
  ConversationsService,
  AutoReplyService,
  MessagesService,
  ScheduledMessagesService,
  // bridges
  MessageTasksService,
];

/**
 * The bounded contexts' services (auth, users, rbac, workspaces, work, content, chat). No controllers:
 * the HTTP API, the WebSocket gateway and the worker each import this and add their own entry points, so a worker can never expose
 * a route without the HTTP guards in front of it.
 */
@Module({ providers: services, exports: services })
export class DomainModule {}
