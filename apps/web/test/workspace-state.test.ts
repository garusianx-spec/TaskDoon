import { describe, expect, it } from 'vitest';
import type { BoardColumn, Conversation, Message, Note, Task } from '@taskin/contracts';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { workspaceReducer, type WorkspaceState } from '@/store/workspace-reducer';
import {
  columnForTask,
  filterConversations,
  filterNotes,
  filterTasks,
  isOverdue,
  lastMessage,
} from '@/store/selectors';

const fixture = DEMO_WORKSPACE_STATE;
const firstTask = fixture.tasks[0]!;
const secondTask = fixture.tasks[1]!;
const firstConversation = fixture.conversations[0]!;
const firstNote = fixture.notes[0]!;

describe('workspace state transitions', () => {
  it('completes and reopens a task in its remembered column without mutating other cards', () => {
    const column: BoardColumn = {
      id: 'test-column',
      title: 'در حال بازبینی',
      status: 'in-progress',
      custom: true,
      projectId: firstTask.projectId,
      tone: null,
    };
    const original: Task = Object.freeze({
      ...firstTask,
      status: 'in-progress',
      boardColumnId: column.id,
      reopenTo: null,
    });
    const state: WorkspaceState = Object.freeze({
      ...fixture,
      tasks: Object.freeze([original, secondTask]),
      boardColumns: Object.freeze([...fixture.boardColumns, column]),
    });

    const completed = workspaceReducer(state, {
      type: 'set-task-completed',
      taskId: original.id,
      completed: true,
    });
    expect(completed.tasks[0]).toMatchObject({
      status: 'done',
      boardColumnId: null,
      reopenTo: { status: 'in-progress', boardColumnId: column.id },
    });
    expect(completed.tasks[1]).toBe(secondTask);
    expect(state.tasks[0]).toBe(original);
    expect(original.status).toBe('in-progress');
    expect(
      workspaceReducer(completed, { type: 'set-task-completed', taskId: original.id, completed: true }),
    ).toBe(completed);

    const reopened = workspaceReducer(completed, {
      type: 'set-task-completed',
      taskId: original.id,
      completed: false,
    });
    expect(reopened.tasks[0]).toMatchObject({ status: original.status, boardColumnId: column.id });
  });

  it('moves the active conversation and read count without clearing another thread', () => {
    const other = fixture.conversations[1]!;
    const unread = Object.freeze({ [firstConversation.id]: 4, [other.id]: 2 });
    const state: WorkspaceState = Object.freeze({
      ...fixture,
      unreadByConversation: unread,
      inspector: { kind: 'conversation', conversationId: other.id } as const,
    });
    const next = workspaceReducer(state, {
      type: 'select-conversation',
      conversationId: firstConversation.id,
    });
    expect(next.activeConversationId).toBe(firstConversation.id);
    expect(next.inspector).toEqual({ kind: 'conversation', conversationId: firstConversation.id });
    expect(next.unreadByConversation).toEqual({ [firstConversation.id]: 0, [other.id]: 2 });
    expect(state.unreadByConversation[firstConversation.id]).toBe(4);
    expect(next.messages).toBe(state.messages);
  });

  it('parks workspace data and restores only its own tasks and notes on return', () => {
    const nextWorkspace = fixture.workspaces.find((entry) => entry.id !== fixture.activeWorkspaceId)!;
    const state = Object.freeze({
      ...fixture,
      tasks: Object.freeze([firstTask]),
      notes: Object.freeze([firstNote]),
    });
    const switched = workspaceReducer(state, { type: 'switch-workspace', workspaceId: nextWorkspace.id });
    expect(switched.activeWorkspaceId).toBe(nextWorkspace.id);
    expect(switched.tasks).toEqual([]);
    expect(switched.notes).toEqual([]);
    expect(workspaceReducer(switched, { type: 'switch-workspace', workspaceId: 'missing' })).toBe(switched);

    const returned = workspaceReducer(switched, {
      type: 'switch-workspace',
      workspaceId: state.activeWorkspaceId,
    });
    expect(returned.tasks).toBe(state.tasks);
    expect(returned.notes).toBe(state.notes);
  });
});

describe('workspace selectors', () => {
  it('combines project scope, assignee, and case-insensitive search without reordering input', () => {
    const assigned: Task = {
      ...firstTask,
      projectId: 'project-a',
      title: 'Next.js Upgrade',
      assigneeIds: ['me'],
    };
    const foreign: Task = {
      ...secondTask,
      projectId: 'project-b',
      title: assigned.title,
      assigneeIds: ['me'],
    };
    const someoneElses: Task = {
      ...firstTask,
      id: 'unassigned',
      projectId: 'project-a',
      title: assigned.title,
      assigneeIds: ['someone'],
    };
    const tasks = Object.freeze([foreign, someoneElses, assigned]);
    expect(
      filterTasks(tasks, {
        projectId: 'project-a',
        smartView: 'my-tasks',
        search: '  next.JS ',
        currentUserId: 'me',
      }),
    ).toEqual([assigned]);
    expect(tasks).toEqual([foreign, someoneElses, assigned]);
  });

  it('resolves placement only against the task’s own project columns', () => {
    const outside: BoardColumn = {
      id: 'outside',
      projectId: 'project-b',
      title: 'ستون دیگر',
      custom: true,
      status: 'in-progress',
      tone: null,
    };
    const own: BoardColumn = {
      id: 'own',
      projectId: 'project-a',
      title: 'در جریان',
      custom: false,
      status: 'in-progress',
      tone: null,
    };
    const task: Task = {
      ...firstTask,
      projectId: 'project-a',
      boardColumnId: outside.id,
      status: 'in-progress',
    };
    expect(columnForTask(Object.freeze([outside, own]), task)).toBe(own);
  });

  it('marks only open tasks overdue, starting the day after the due date', () => {
    const task: Task = { ...firstTask, status: 'in-progress', dueDate: '2026-02-15' };
    expect(isOverdue(task, new Date(2026, 1, 15, 23, 59))).toBe(false);
    expect(isOverdue(task, new Date(2026, 1, 16))).toBe(true);
    expect(isOverdue({ ...task, status: 'done' }, new Date(2026, 1, 16))).toBe(false);
  });

  it('filters notes by category and orders pins before recency without mutating the fixture', () => {
    const newer: Note = {
      ...firstNote,
      id: 'new',
      categoryId: 'work',
      pinned: false,
      updatedAt: '2025-03-20T15:00:00Z',
    };
    const older: Note = { ...newer, id: 'old', pinned: true, updatedAt: '2025-03-19T15:00:00Z' };
    const unrelated: Note = { ...newer, id: 'other', categoryId: 'personal' };
    const notes = Object.freeze([newer, unrelated, older]);
    expect(filterNotes(notes, { categoryId: 'work', color: null, search: '' })).toEqual([older, newer]);
    expect(notes).toEqual([newer, unrelated, older]);
  });

  it('keeps an empty unpinned conversation below all threads with messages', () => {
    const conversation = (id: string): Conversation => ({ ...firstConversation, id, title: id });
    const message = (id: string, conversationId: string, sentAt: string): Message => ({
      ...fixture.messages[0]!,
      id,
      conversationId,
      sentAt,
    });
    const conversations = Object.freeze(['older', 'empty', 'newest', 'pinned'].map(conversation));
    const messages = Object.freeze([
      message('first', 'older', '2025-03-19T12:00:00Z'),
      message('latest', 'newest', '2025-03-20T12:00:00Z'),
    ]);
    const sorted = filterConversations(conversations, messages, {
      filter: 'all',
      search: '',
      unreadByConversation: {},
      pinnedIds: ['pinned'],
    });
    expect(sorted.map((entry) => entry.id)).toEqual(['pinned', 'newest', 'older', 'empty']);
    expect(conversations.map((entry) => entry.id)).toEqual(['older', 'empty', 'newest', 'pinned']);
  });

  it('takes the last arrival even when its device clock is behind', () => {
    const first: Message = {
      ...fixture.messages[0]!,
      id: 'first',
      conversationId: 'thread',
      sentAt: '2025-03-20T12:00:00Z',
    };
    const last: Message = { ...first, id: 'last', sentAt: '2025-03-20T11:59:00Z' };
    expect(lastMessage(Object.freeze([first, last]), 'thread')).toBe(last);
  });
});
