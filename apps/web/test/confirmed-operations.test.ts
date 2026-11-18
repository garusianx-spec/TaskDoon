import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEventView, ScheduledMessageView } from '@taskin/contracts';
import { api } from '@/api/endpoints';
import { operationConfirmation, type ConfirmedOperation } from '@/store/confirmed-operation';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { LiveStore } from '@/store/live/live-store';
import { workspaceReducer } from '@/store/workspace-reducer';

function connectedStore() {
  let state = {
    ...DEMO_WORKSPACE_STATE,
    calendarEvents: [],
    scheduledMessages: [],
  } as typeof DEMO_WORKSPACE_STATE;
  const store = new LiveStore();
  Object.assign(store, {
    workspaceId: state.activeWorkspaceId,
    status: { ...store.current, phase: 'ready' },
  });
  store.attach(
    () => state,
    (action) => {
      state = workspaceReducer(state, action);
    },
  );
  return { store, state: () => state };
}

const event: CalendarEventView = {
  id: 'event-1',
  kind: 'meeting',
  title: 'بازبینی پروژه',
  description: 'مرور روند کار',
  date: '2026-12-15',
  endDate: null,
  startTime: '10:00',
  endTime: '11:00',
  startsAt: '2026-12-15T06:30:00Z',
  projectId: null,
  attendeeIds: [],
  createdById: 'owner',
  version: 1,
};

afterEach(() => vi.restoreAllMocks());

describe('confirmed workspace operations', () => {
  it('keeps a note on failed deletion and reports the confirmed fixture deletion', async () => {
    const fixture = connectedStore();
    const note = fixture.state().notes[0]!;
    const operation = { type: 'delete-note', noteId: note.id } as const;
    const remove = vi
      .spyOn(api.notes, 'remove')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await expect(fixture.store.confirmOperation(operation)).rejects.toThrow('offline');
    expect(fixture.state().notes.some((entry) => entry.id === note.id)).toBe(true);
    await fixture.store.confirmOperation(operation);
    expect(fixture.state().notes.some((entry) => entry.id === note.id)).toBe(false);
    expect(operationConfirmation(operation, fixture.state())).toBe('یادداشت حذف شد.');
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('keeps the calendar unchanged during a failure and inserts the confirmed event once on retry', async () => {
    const fixture = connectedStore();
    const draft = {
      kind: event.kind,
      title: event.title,
      description: event.description,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      projectId: null,
      attendeeIds: [],
    };
    const operation = { type: 'create-calendar-event', draft } satisfies ConfirmedOperation;
    const apiCreate = vi.spyOn(api.calendar, 'create').mockRejectedValueOnce(new Error('response lost'));
    const announcement = fixture.state().announcement;

    await expect(fixture.store.confirmOperation(operation, 'same-command')).rejects.toThrow('response lost');
    expect(fixture.state().calendarEvents).toEqual([]);
    expect(fixture.state().announcement).toBe(announcement);

    let confirm!: (value: CalendarEventView) => void;
    apiCreate.mockReturnValueOnce(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
    const saving = fixture.store.confirmOperation(operation, 'same-command');
    expect(fixture.state().calendarEvents).toEqual([]);
    confirm(event);
    await saving;

    expect(apiCreate.mock.calls).toEqual(
      Array.from({ length: 2 }, () => [fixture.state().activeWorkspaceId, draft, 'same-command']),
    );
    expect(fixture.state().calendarEvents).toMatchObject([{ id: event.id, title: event.title }]);
    expect(fixture.state().calendarFocusDate).toBe(event.date);
    expect(fixture.state().announcement).toBe(announcement);
  });

  it('keeps one schedule across a retry and removes it only when cancellation is confirmed', async () => {
    const fixture = connectedStore();
    const scheduled: ScheduledMessageView = {
      id: 'scheduled-1',
      conversationId: 'chat-1',
      authorId: fixture.state().meId,
      kind: 'text',
      text: 'یادآوری تحویل',
      meta: null,
      attachment: null,
      replyToId: null,
      clientMsgId: 'schedule-command',
      scheduledAt: '2026-12-16T06:30:00Z',
      status: 'pending',
      messageId: null,
      failureCode: null,
      createdAt: '2026-12-15T06:30:00Z',
    };
    const operation = {
      type: 'schedule-message',
      scheduledId: 'local-1',
      conversationId: scheduled.conversationId,
      authorId: scheduled.authorId,
      text: scheduled.text!,
      replyToId: null,
      scheduledAt: scheduled.scheduledAt,
    } satisfies ConfirmedOperation;
    const create = vi
      .spyOn(api.scheduled, 'create')
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValue(scheduled);

    await expect(fixture.store.confirmOperation(operation, scheduled.clientMsgId)).rejects.toThrow(
      'response lost',
    );
    expect(fixture.state().scheduledMessages).toEqual([]);
    await fixture.store.confirmOperation(operation, scheduled.clientMsgId);
    expect(create.mock.calls.map(([, , body]) => body.clientMsgId)).toEqual([
      scheduled.clientMsgId,
      scheduled.clientMsgId,
    ]);
    expect(fixture.state().scheduledMessages).toMatchObject([{ id: scheduled.id, text: scheduled.text }]);

    const cancel = {
      type: 'cancel-scheduled-message',
      scheduledId: scheduled.id,
    } satisfies ConfirmedOperation;
    vi.spyOn(api.scheduled, 'cancel')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    await expect(fixture.store.confirmOperation(cancel)).rejects.toThrow('offline');
    expect(fixture.state().scheduledMessages).toHaveLength(1);
    await fixture.store.confirmOperation(cancel);
    expect(fixture.state().scheduledMessages).toEqual([]);
  });
});
