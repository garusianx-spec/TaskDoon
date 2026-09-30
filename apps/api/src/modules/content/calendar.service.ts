import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  CalendarEventKind,
  CalendarEventView,
  CalendarView,
  CreateCalendarEventBody,
  DeadlineView,
  UpdateCalendarEventBody,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock, dateIn, instantIn, timeIn } from '../../platform/clock/clock.js';
import type { Tx } from '../../platform/db/database.js';
import { isoDate, isoDateOrNull, isoOrNull } from '../../platform/db/rows.js';
import { calendarEventAttendees, calendarEvents, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { AccessService, assertAction, projectVisibleSql } from '../work/access.js';
import { FeedService } from './feed.service.js';

type EventRow = typeof calendarEvents.$inferSelect;

/** Meetings remind this long before they start; reminders fire on time; milestones never. */
const MEETING_LEAD_MS = 15 * 60 * 1000;
/** All-day reminders and meetings remind at this hour of the day, in the workspace's zone. */
const ALL_DAY_REMINDER_TIME = '09:00';
/** The longest range one calendar request may cover. */
const MAX_RANGE_DAYS = 100;

interface EventJson {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  projectId: string | null;
  createdById: string;
  version: number;
  attendeeIds: string[];
}

/** An event as the calendar shows it: dates and times on the workspace's wall clock. */
function eventView(row: EventJson, timeZone: string): CalendarEventView {
  const startsAt = row.startsAt ? new Date(row.startsAt) : null;
  const endsAt = row.endsAt ? new Date(row.endsAt) : null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    date: startsAt ? dateIn(timeZone, startsAt) : isoDate(row.startDate ?? ''),
    endDate: startsAt ? (endsAt && dateIn(timeZone, endsAt) !== dateIn(timeZone, startsAt) ? dateIn(timeZone, endsAt) : null) : isoDateOrNull(row.endDate),
    startTime: startsAt ? timeIn(timeZone, startsAt) : null,
    endTime: endsAt ? timeIn(timeZone, endsAt) : null,
    startsAt: isoOrNull(row.startsAt),
    projectId: row.projectId,
    attendeeIds: row.attendeeIds,
    createdById: row.createdById,
    version: row.version,
  };
}

function eventJson(row: EventRow, attendeeIds: string[]): EventJson {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    allDay: row.allDay,
    startDate: row.startDate,
    endDate: row.endDate,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    projectId: row.projectId,
    createdById: row.createdBy,
    version: row.version,
    attendeeIds,
  };
}

interface Timing {
  readonly allDay: boolean;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

/**
 * Meetings, reminders and milestones (RFC §8–9). Task deadlines are not events: the calendar
 * derives them from the tasks in the same statement, so there is nothing to keep in sync.
 * Project events follow the project's permissions; personal ones belong to their author and
 * attendees.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly access: AccessService,
    private readonly feed: FeedService,
    private readonly clock: Clock,
  ) {}

  /** A date range: its events and the deadlines of open tasks, in one statement. */
  async view(member: MembershipContext, from: string, to: string): Promise<CalendarView> {
    if (to < from) throw ApiError.validation([{ field: 'to', message: 'must not be before from' }]);
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) {
      throw ApiError.validation([{ field: 'to', message: `a range covers at most ${MAX_RANGE_DAYS} days` }]);
    }
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<{ time_zone: string; events: EventJson[] | null; deadlines: (Omit<DeadlineView, 'dueDate'> & { dueDate: string })[] | null }>(sql`
        with ws as (select settings ->> 'timeZone' as tz from workspaces where id = ${member.workspaceId})
        select ws.tz as time_zone,
          (select json_agg(json_build_object(
              'id', e.id, 'kind', e.kind, 'title', e.title, 'description', e.description, 'allDay', e.all_day,
              'startDate', e.start_date, 'endDate', e.end_date, 'startsAt', e.starts_at, 'endsAt', e.ends_at,
              'projectId', e.project_id, 'createdById', e.created_by, 'version', e.version,
              'attendeeIds', coalesce((select array_agg(a.user_id order by a.user_id) from calendar_event_attendees a where a.event_id = e.id), '{}'))
            order by coalesce(e.start_date, (e.starts_at at time zone ws.tz)::date), e.starts_at nulls first, e.id)
           from calendar_events e
           left join projects p on p.workspace_id = e.workspace_id and p.id = e.project_id
           where e.workspace_id = ${member.workspaceId} and e.deleted_at is null
             and ((e.all_day and e.start_date <= ${to}::date and coalesce(e.end_date, e.start_date) >= ${from}::date)
               or (not e.all_day and e.starts_at >= (${from}::date::timestamp at time zone ws.tz)
                                 and e.starts_at < ((${to}::date + 1)::timestamp at time zone ws.tz)))
             and ((e.project_id is null and (e.created_by = ${member.userId}
                     or exists (select 1 from calendar_event_attendees a where a.event_id = e.id and a.user_id = ${member.userId})))
               or (e.project_id is not null and ${projectVisibleSql(member)}))) as events,
          (select json_agg(json_build_object('taskId', t.id, 'code', p.key || '-' || t.number, 'title', t.title, 'dueDate', t.due_date,
                                             'status', t.status, 'priority', t.priority, 'projectId', t.project_id) order by t.due_date, t.id)
           from tasks t
           join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
           where t.workspace_id = ${member.workspaceId} and t.deleted_at is null and t.archived_at is null and t.status <> 'done'
             and t.due_date between ${from}::date and ${to}::date
             and ${projectVisibleSql(member)}) as deadlines
        from ws`),
    );
    const row = result.rows[0];
    const timeZone = row?.time_zone ?? 'Asia/Tehran';
    return {
      from,
      to,
      timeZone,
      events: (row?.events ?? []).map((event) => eventView(event, timeZone)),
      deadlines: (row?.deadlines ?? []).map((deadline) => ({ ...deadline, dueDate: isoDate(deadline.dueDate) })),
    };
  }

  async get(member: MembershipContext, eventId: string): Promise<CalendarEventView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const { row, attendees } = await this.load(tx, member, eventId);
      return eventView(eventJson(row, attendees), await this.timeZone(tx, member.workspaceId));
    });
  }

  async create(member: MembershipContext, body: CreateCalendarEventBody): Promise<CalendarEventView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const timeZone = await this.timeZone(tx, member.workspaceId);
      const timing = this.timing(body.kind, timeZone, body.date, body.endDate ?? null, body.startTime ?? null, body.endTime ?? null);
      const attendeeIds = [...new Set(body.attendeeIds ?? [])];
      await this.checkPeople(tx, member, body.projectId ?? null, attendeeIds, 'create');
      const [row] = await tx
        .insert(calendarEvents)
        .values({
          workspaceId: member.workspaceId,
          kind: body.kind,
          title: body.title.trim(),
          description: body.description?.trim() ?? '',
          projectId: body.projectId ?? null,
          ...timing,
          timeZone,
          createdBy: member.userId,
        })
        .returning();
      if (!row) throw new Error('event insert returned nothing');
      if (attendeeIds.length > 0) {
        await tx.insert(calendarEventAttendees).values(attendeeIds.map((userId) => ({ workspaceId: member.workspaceId, eventId: row.id, userId })));
      }
      await this.audit.write(tx, {
        action: 'calendar.event.create',
        workspaceId: member.workspaceId,
        resourceType: 'calendar_event',
        resourceId: row.id,
        changes: { after: { kind: row.kind, title: row.title, projectId: row.projectId } },
      });
      await this.schedule(tx, member, row, timeZone);
      return eventView(eventJson(row, attendeeIds), timeZone);
    });
  }

  async update(member: MembershipContext, eventId: string, ifMatch: number, body: UpdateCalendarEventBody): Promise<CalendarEventView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const { row, attendees } = await this.load(tx, member, eventId, true);
      await this.assertCanChange(tx, member, row, 'edit');
      const timeZone = await this.timeZone(tx, member.workspaceId);
      const current = eventView(eventJson(row, attendees), timeZone);
      if (row.version !== ifMatch) throw ApiError.stale(current);
      const kind = body.kind ?? row.kind;
      const timing = this.timing(
        kind,
        timeZone,
        body.date ?? current.date,
        body.endDate !== undefined ? body.endDate : current.endDate,
        body.startTime !== undefined ? body.startTime : current.startTime,
        body.endTime !== undefined ? body.endTime : current.endTime,
      );
      let attendeeIds = attendees;
      if (body.attendeeIds !== undefined) {
        attendeeIds = [...new Set(body.attendeeIds)];
        await this.checkPeople(tx, member, row.projectId, attendeeIds, null);
        await tx.delete(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, eventId));
        if (attendeeIds.length > 0) {
          await tx.insert(calendarEventAttendees).values(attendeeIds.map((userId) => ({ workspaceId: member.workspaceId, eventId, userId })));
        }
      }
      const [updated] = await tx
        .update(calendarEvents)
        .set({
          kind,
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description.trim() } : {}),
          ...timing,
          version: sql`${calendarEvents.version} + 1`,
        })
        .where(and(eq(calendarEvents.workspaceId, member.workspaceId), eq(calendarEvents.id, eventId)))
        .returning();
      if (!updated) throw ApiError.notFound('The event');
      await this.audit.write(tx, { action: 'calendar.event.update', workspaceId: member.workspaceId, resourceType: 'calendar_event', resourceId: eventId, changes: { after: body } });
      // The new version gets its own reminder; the old job finds a newer version and does nothing.
      await this.schedule(tx, member, updated, timeZone);
      return eventView(eventJson(updated, attendeeIds), timeZone);
    });
  }

  async remove(member: MembershipContext, eventId: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const { row } = await this.load(tx, member, eventId, true);
      await this.assertCanChange(tx, member, row, 'delete');
      await tx
        .update(calendarEvents)
        .set({ deletedAt: sql`now()`, version: sql`${calendarEvents.version} + 1` })
        .where(and(eq(calendarEvents.workspaceId, member.workspaceId), eq(calendarEvents.id, eventId)));
      await this.audit.write(tx, { action: 'calendar.event.delete', workspaceId: member.workspaceId, resourceType: 'calendar_event', resourceId: eventId, changes: { before: { title: row.title } } });
      await this.outbox.add(tx, { type: 'calendar.event.deleted', aggregateType: 'calendar_event', aggregateId: eventId, workspaceId: member.workspaceId, payload: { eventId } });
    });
  }

  /**
   * Worker: a reminder fires. It no-ops unless the event still has the version it was scheduled
   * for (RFC §9), then notifies the author and the attendees who are still members.
   */
  async remind(workspaceId: string, eventId: string, version: number): Promise<'sent' | 'stale'> {
    return this.uow.run({ workspaceId, userId: null }, async (unit) => {
      const { tx } = unit;
      const [row] = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.workspaceId, workspaceId), eq(calendarEvents.id, eventId)));
      if (!row || row.deletedAt || row.version !== version) return 'stale';
      const attendees = (await tx.select({ userId: calendarEventAttendees.userId }).from(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, eventId))).map(
        (entry) => entry.userId,
      );
      const people = [...new Set([row.createdBy, ...attendees])];
      const active = (
        await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, people), eq(workspaceMembers.status, 'active')))
      ).map((entry) => entry.userId);
      await this.feed.notify(
        unit,
        active.map((recipientId) => ({
          workspaceId,
          recipientId,
          actorId: null,
          kind: 'event-reminder' as const,
          subject: row.title,
          targetType: 'event' as const,
          targetId: eventId,
          payload: { kind: row.kind, startsAt: row.startsAt?.toISOString() ?? null, date: row.startDate },
          dedupeKey: `event:${eventId}:v${version}`,
        })),
      );
      return 'sent';
    });
  }

  /* ------------------------------------------------------------------ helpers */

  /**
   * Turns wall-clock input into storage: all-day entries keep dates; timed ones become instants
   * in the workspace's zone (so "09:00" means 09:00 in Tehran whatever the server's zone).
   */
  private timing(kind: CalendarEventKind, timeZone: string, date: string, endDate: string | null, startTime: string | null, endTime: string | null): Timing {
    if (kind === 'milestone' && (startTime || endTime)) throw ApiError.validation([{ field: 'startTime', message: 'milestones are all-day' }]);
    if (!startTime) {
      if (endTime) throw ApiError.validation([{ field: 'endTime', message: 'needs a start time' }]);
      if (endDate && endDate < date) throw ApiError.validation([{ field: 'endDate', message: 'must not be before date' }]);
      return { allDay: true, startDate: date, endDate: endDate && endDate !== date ? endDate : null, startsAt: null, endsAt: null };
    }
    const startsAt = instantIn(timeZone, date, startTime);
    const endsAt = endTime ? instantIn(timeZone, endDate ?? date, endTime) : null;
    if (endsAt && endsAt <= startsAt) throw ApiError.validation([{ field: 'endTime', message: 'must be after the start' }]);
    return { allDay: false, startDate: null, endDate: null, startsAt, endsAt };
  }

  /** When to remind about `row`, or `null` (milestones, and anything already past). */
  private remindAt(row: EventRow, timeZone: string): Date | null {
    if (row.kind === 'milestone') return null;
    const at = row.startsAt
      ? new Date(row.startsAt.getTime() - (row.kind === 'meeting' ? MEETING_LEAD_MS : 0))
      : row.startDate
        ? instantIn(timeZone, row.startDate, ALL_DAY_REMINDER_TIME)
        : null;
    return at && at.getTime() > this.clock.now().getTime() ? at : null;
  }

  private async schedule(tx: Tx, member: MembershipContext, row: EventRow, timeZone: string): Promise<void> {
    await this.outbox.add(tx, {
      type: 'calendar.event.changed',
      aggregateType: 'calendar_event',
      aggregateId: row.id,
      workspaceId: member.workspaceId,
      payload: { eventId: row.id, version: row.version, remindAt: this.remindAt(row, timeZone)?.toISOString() ?? null },
    });
  }

  /** Attendees must be members; for a project event they must see the project, and so must you. */
  private async checkPeople(tx: Tx, member: MembershipContext, projectId: string | null, attendeeIds: readonly string[], action: 'create' | null): Promise<void> {
    if (projectId) {
      const { project, actions } = await this.access.project(tx, member, projectId);
      if (action) assertAction(actions, action);
      await this.access.assertCanView(tx, member.workspaceId, project.id, project.visibility, attendeeIds);
      return;
    }
    if (attendeeIds.length === 0) return;
    const active = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), inArray(workspaceMembers.userId, [...attendeeIds]), eq(workspaceMembers.status, 'active')));
    if (active.length !== attendeeIds.length) throw ApiError.validation([{ field: 'attendeeIds', message: 'every attendee must be a member' }]);
  }

  /** Personal events change only by their author; project events also by whoever holds the action. */
  private async assertCanChange(tx: Tx, member: MembershipContext, row: EventRow, action: 'edit' | 'delete'): Promise<void> {
    if (row.createdBy === member.userId || member.isOwner) return;
    if (!row.projectId) throw ApiError.forbidden();
    const { actions } = await this.access.project(tx, member, row.projectId);
    assertAction(actions, action);
  }

  /** An event the member can see, with its attendees; anything else is 404. */
  private async load(tx: Tx, member: MembershipContext, eventId: string, lock = false): Promise<{ row: EventRow; attendees: string[] }> {
    const query = tx
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.workspaceId, member.workspaceId), eq(calendarEvents.id, eventId), isNull(calendarEvents.deletedAt)));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw ApiError.notFound('The event');
    const attendees = (await tx.select({ userId: calendarEventAttendees.userId }).from(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, eventId))).map(
      (entry) => entry.userId,
    );
    if (row.projectId) {
      try {
        await this.access.project(tx, member, row.projectId);
      } catch {
        throw ApiError.notFound('The event');
      }
    } else if (row.createdBy !== member.userId && !attendees.includes(member.userId)) {
      throw ApiError.notFound('The event');
    }
    return { row, attendees: attendees.sort() };
  }

  private async timeZone(tx: Tx, workspaceId: string): Promise<string> {
    const [workspace] = await tx.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId));
    return workspace?.settings.timeZone ?? 'Asia/Tehran';
  }
}
