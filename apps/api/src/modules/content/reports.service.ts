import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { MonthlyTaskReport } from '@taskin/contracts';
import { gregorianToJalali, JALALI_MONTHS, jalaliToGregorian } from '@taskin/jalali';
import { isoDate, num } from '../../platform/db/rows.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { AbilityFactory } from '../rbac/ability.js';
import { projectVisibleSql } from '../work/access.js';

/** `YYYY-MM-DD` of a Gregorian date built by `jalaliToGregorian` (a local-midnight Date). */
function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Reports on the Jalali calendar (RFC §9): the Jalali year becomes a Gregorian date range before
 * the query, the database groups by the workspace-zone date, and the dates are folded into Jalali
 * months with the same converter the web app uses, so Esfand 30 of a leap year lands in Esfand.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly abilities: AbilityFactory,
  ) {}

  async tasksByMonth(member: MembershipContext, jalaliYear: number): Promise<MonthlyTaskReport> {
    if (!this.abilities.forMember(member).can('view', 'Report')) throw ApiError.forbidden();
    const from = localIso(jalaliToGregorian(jalaliYear, 1, 1));
    const until = localIso(jalaliToGregorian(jalaliYear + 1, 1, 1));
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<{ time_zone: string; day: string | null; created: string; completed: string }>(sql`
        with ws as (select settings ->> 'timeZone' as tz from workspaces where id = ${member.workspaceId}),
        visible as (
          select t.created_at, t.completed_at, t.status
          from tasks t
          join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
          where t.workspace_id = ${member.workspaceId} and t.deleted_at is null and ${projectVisibleSql(member)}
        ),
        days as (
          select (v.created_at at time zone ws.tz)::date as day, 1 as created, 0 as completed from visible v, ws
          where v.created_at >= (${from}::date::timestamp at time zone ws.tz) and v.created_at < (${until}::date::timestamp at time zone ws.tz)
          union all
          select (v.completed_at at time zone ws.tz)::date, 0, 1 from visible v, ws
          where v.status = 'done' and v.completed_at >= (${from}::date::timestamp at time zone ws.tz) and v.completed_at < (${until}::date::timestamp at time zone ws.tz)
        )
        select ws.tz as time_zone, d.day, coalesce(sum(d.created), 0) as created, coalesce(sum(d.completed), 0) as completed
        from ws left join days d on true
        group by ws.tz, d.day`),
    );
    const months = JALALI_MONTHS.map((name, index) => ({ month: index + 1, name, created: 0, completed: 0 }));
    for (const row of result.rows) {
      if (!row.day) continue;
      const [year, month, day] = isoDate(row.day).split('-').map(Number) as [number, number, number];
      const jalali = gregorianToJalali(new Date(year, month - 1, day));
      const bucket = months[jalali.month - 1];
      if (!bucket || jalali.year !== jalaliYear) continue;
      bucket.created += num(row.created);
      bucket.completed += num(row.completed);
    }
    return { jalaliYear, timeZone: result.rows[0]?.time_zone ?? 'Asia/Tehran', months };
  }
}
