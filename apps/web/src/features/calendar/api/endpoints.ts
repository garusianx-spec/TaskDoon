import type { CalendarEventView, CalendarView, CreateCalendarEventBody } from '@taskin/contracts';
import { http, query } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const calendarEndpoints = {
  calendar: {
    range: (workspaceId: string, from: string, to: string) =>
      http.get<CalendarView>(`${workspacePath(workspaceId)}/calendar${query({ from, to })}`),
    create: (workspaceId: string, body: CreateCalendarEventBody) =>
      http.post<CalendarEventView>(`${workspacePath(workspaceId)}/calendar/events`, body, {
        idempotent: true,
      }),
  },
};
