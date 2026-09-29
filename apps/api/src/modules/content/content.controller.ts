import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Redirect } from '@nestjs/common';
import { ApiCreatedResponse, ApiFoundResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  ActivityPage,
  AttachmentView,
  CalendarEventView,
  CalendarView,
  ConvertNoteResult,
  FileLink,
  MonthlyTaskReport,
  NoteCategoryView,
  NotePage,
  NoteView,
  NotificationPage,
  UploadView,
} from '@taskin/contracts';
import { requireIfMatch } from '../../platform/http/api-error.js';
import { Idempotent } from '../../platform/http/idempotency.js';
import type { AuthPrincipal, MembershipContext } from '../../platform/http/request.js';
import { Authenticated, CurrentAuth } from '../auth/guards.js';
import { CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { AttachmentViewDto, FileLinkDto } from '../work/work.dto.js';
import { CalendarService } from './calendar.service.js';
import {
  ActivityPageDto,
  CalendarEventViewDto,
  CalendarQueryDto,
  CalendarViewDto,
  CompleteUploadDto,
  ConvertNoteDto,
  ConvertNoteResultDto,
  CreateCalendarEventDto,
  CreateNoteCategoryDto,
  CreateNoteDto,
  CreateUploadDto,
  FileLinkQueryDto,
  InboxQueryDto,
  MarkedDto,
  MarkNotificationsReadDto,
  MonthlyTaskReportDto,
  NoteCategoryViewDto,
  NoteListQueryDto,
  NotePageDto,
  NoteViewDto,
  NotificationPageDto,
  PageQueryDto,
  ReportQueryDto,
  UpdateCalendarEventDto,
  UpdateNoteCategoryDto,
  UpdateNoteDto,
  UploadViewDto,
} from './content.dto.js';
import { FeedService } from './feed.service.js';
import { FilesService } from './files.service.js';
import { NotesService } from './notes.service.js';
import { ReportsService } from './reports.service.js';

const UUID = new ParseUUIDPipe();

/** Files, notes, the calendar, the activity feed and reports (RFC §12). */
@ApiTags('content')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId')
export class ContentController {
  constructor(
    private readonly files: FilesService,
    private readonly notes: NotesService,
    private readonly calendar: CalendarService,
    private readonly feed: FeedService,
    private readonly reports: ReportsService,
  ) {}

  /* ----------------------------------------------------------- files */

  @Post('files/uploads')
  @Idempotent()
  @ApiOperation({ summary: 'Plan an upload: reserves the bytes and returns a presigned POST (≤ 16 MB) or multipart parts' })
  @ApiCreatedResponse({ type: UploadViewDto })
  createUpload(@CurrentMember() member: MembershipContext, @Body() body: CreateUploadDto): Promise<UploadView> {
    return this.files.createUpload(member, body);
  }

  @Post('files/uploads/:attachmentId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the stored file (exact size, real type) and hand it to the scanner' })
  @ApiOkResponse({ type: AttachmentViewDto })
  completeUpload(@CurrentMember() member: MembershipContext, @Param('attachmentId', UUID) attachmentId: string, @Body() body: CompleteUploadDto): Promise<AttachmentView> {
    return this.files.complete(member, attachmentId, body);
  }

  @Post('files/uploads/:attachmentId/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  abortUpload(@CurrentMember() member: MembershipContext, @Param('attachmentId', UUID) attachmentId: string): Promise<void> {
    return this.files.abort(member, attachmentId);
  }

  @Get('files/:attachmentId/download')
  @Redirect()
  @ApiOperation({ summary: 'Redirect to a 5-minute download link (always an attachment, RFC 5987 name)' })
  @ApiFoundResponse()
  async download(@CurrentMember() member: MembershipContext, @Param('attachmentId', UUID) attachmentId: string): Promise<{ url: string; statusCode: number }> {
    return { url: await this.files.downloadUrl(member, attachmentId), statusCode: HttpStatus.FOUND };
  }

  @Get('files/:attachmentId/link')
  @ApiOperation({ summary: 'A short-lived link as JSON: `inline` for images, audio and video (to show or play), else a download' })
  @ApiOkResponse({ type: FileLinkDto })
  fileLink(@CurrentMember() member: MembershipContext, @Param('attachmentId', UUID) attachmentId: string, @Query() query: FileLinkQueryDto): Promise<FileLink> {
    return this.files.link(member, attachmentId, query.disposition ?? 'attachment');
  }

  /* ----------------------------------------------------------- notes */

  @Get('note-categories')
  @ApiOkResponse({ type: NoteCategoryViewDto, isArray: true })
  categories(@CurrentMember() member: MembershipContext): Promise<NoteCategoryView[]> {
    return this.notes.categories(member);
  }

  @Post('note-categories')
  @ApiCreatedResponse({ type: NoteCategoryViewDto })
  createCategory(@CurrentMember() member: MembershipContext, @Body() body: CreateNoteCategoryDto): Promise<NoteCategoryView> {
    return this.notes.createCategory(member, body);
  }

  @Patch('note-categories/:categoryId')
  @ApiOkResponse({ type: NoteCategoryViewDto })
  updateCategory(@CurrentMember() member: MembershipContext, @Param('categoryId', UUID) categoryId: string, @Body() body: UpdateNoteCategoryDto): Promise<NoteCategoryView> {
    return this.notes.updateCategory(member, categoryId, body);
  }

  @Delete('note-categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notebook, built-in or custom; its notes are kept, filed in no notebook' })
  removeCategory(@CurrentMember() member: MembershipContext, @Param('categoryId', UUID) categoryId: string): Promise<void> {
    return this.notes.removeCategory(member, categoryId);
  }

  @Get('notes')
  @ApiOkResponse({ type: NotePageDto })
  listNotes(@CurrentMember() member: MembershipContext, @Query() query: NoteListQueryDto): Promise<NotePage> {
    return this.notes.list(member, { categoryId: query.categoryId, q: query.q, cursor: query.cursor, limit: query.limit ?? 50 });
  }

  @Post('notes')
  @Idempotent()
  @ApiCreatedResponse({ type: NoteViewDto })
  createNote(@CurrentMember() member: MembershipContext, @Body() body: CreateNoteDto): Promise<NoteView> {
    return this.notes.create(member, body);
  }

  @Get('notes/:noteId')
  @ApiOkResponse({ type: NoteViewDto })
  getNote(@CurrentMember() member: MembershipContext, @Param('noteId', UUID) noteId: string): Promise<NoteView> {
    return this.notes.get(member, noteId);
  }

  @Patch('notes/:noteId')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The note version being saved' })
  @ApiOkResponse({ type: NoteViewDto })
  updateNote(
    @CurrentMember() member: MembershipContext,
    @Param('noteId', UUID) noteId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateNoteDto,
  ): Promise<NoteView> {
    return this.notes.update(member, noteId, requireIfMatch(ifMatch), body);
  }

  @Delete('notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeNote(@CurrentMember() member: MembershipContext, @Param('noteId', UUID) noteId: string): Promise<void> {
    return this.notes.remove(member, noteId);
  }

  @Post('notes/:noteId/task')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert a note to a task; open checklist items become subtasks (once per note)' })
  @ApiOkResponse({ type: ConvertNoteResultDto })
  convertNote(@CurrentMember() member: MembershipContext, @Param('noteId', UUID) noteId: string, @Body() body: ConvertNoteDto): Promise<ConvertNoteResult> {
    return this.notes.convert(member, noteId, body);
  }

  /* ----------------------------------------------------------- calendar */

  @Get('calendar')
  @ApiOperation({ summary: 'Events and open-task deadlines in a date range (at most 100 days)' })
  @ApiOkResponse({ type: CalendarViewDto })
  calendarView(@CurrentMember() member: MembershipContext, @Query() query: CalendarQueryDto): Promise<CalendarView> {
    return this.calendar.view(member, query.from, query.to);
  }

  @Post('calendar/events')
  @Idempotent()
  @ApiCreatedResponse({ type: CalendarEventViewDto })
  createEvent(@CurrentMember() member: MembershipContext, @Body() body: CreateCalendarEventDto): Promise<CalendarEventView> {
    return this.calendar.create(member, body);
  }

  @Get('calendar/events/:eventId')
  @ApiOkResponse({ type: CalendarEventViewDto })
  getEvent(@CurrentMember() member: MembershipContext, @Param('eventId', UUID) eventId: string): Promise<CalendarEventView> {
    return this.calendar.get(member, eventId);
  }

  @Patch('calendar/events/:eventId')
  @ApiHeader({ name: 'If-Match', required: true, description: 'The event version being changed' })
  @ApiOkResponse({ type: CalendarEventViewDto })
  updateEvent(
    @CurrentMember() member: MembershipContext,
    @Param('eventId', UUID) eventId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateCalendarEventDto,
  ): Promise<CalendarEventView> {
    return this.calendar.update(member, eventId, requireIfMatch(ifMatch), body);
  }

  @Delete('calendar/events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEvent(@CurrentMember() member: MembershipContext, @Param('eventId', UUID) eventId: string): Promise<void> {
    return this.calendar.remove(member, eventId);
  }

  /* ----------------------------------------------------------- feed and reports */

  @Get('activity')
  @ApiOperation({ summary: 'The workspace feed, limited to projects the caller can see' })
  @ApiOkResponse({ type: ActivityPageDto })
  activity(@CurrentMember() member: MembershipContext, @Query() query: PageQueryDto): Promise<ActivityPage> {
    return this.feed.activityPage(member, { cursor: query.cursor, limit: query.limit ?? 50 });
  }

  @Get('reports/tasks-by-month')
  @ApiOperation({ summary: 'Tasks created and completed per Jalali month of a Jalali year' })
  @ApiOkResponse({ type: MonthlyTaskReportDto })
  tasksByMonth(@CurrentMember() member: MembershipContext, @Query() query: ReportQueryDto): Promise<MonthlyTaskReport> {
    return this.reports.tasksByMonth(member, query.jalaliYear);
  }
}

/** The signed-in user's inbox across every workspace they belong to. */
@ApiTags('content')
@Authenticated()
@Controller('me/notifications')
export class InboxController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  inbox(@CurrentAuth() principal: AuthPrincipal, @Query() query: InboxQueryDto): Promise<NotificationPage> {
    return this.feed.inbox(principal, { workspaceId: query.workspaceId, filter: query.filter ?? 'all', cursor: query.cursor, limit: query.limit ?? 50 });
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notifications read: by id, or all (optionally in one workspace)' })
  @ApiOkResponse({ type: MarkedDto })
  async markRead(@CurrentAuth() principal: AuthPrincipal, @Body() body: MarkNotificationsReadDto): Promise<{ marked: number }> {
    return { marked: await this.feed.markRead(principal, body) };
  }
}
