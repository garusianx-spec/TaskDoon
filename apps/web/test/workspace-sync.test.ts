import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, ConversationView, Message, Project, ProjectView } from '@taskin/contracts';
import { LIVE_EMPTY_STATE } from '../src/store/initial-state';
import { workspaceReducer, type WorkspaceAction, type WorkspaceState } from '../src/store/workspace-reducer';

import { LiveStore } from '../src/store/live/live-store';
import { api } from '../src/api/endpoints';

afterEach(() => { vi.restoreAllMocks(); });

const localProjectId = 'project-local-101';
const serverProjectId = '01900000-0000-7000-8000-000000000001';
const serverChannelId = '01900000-0000-7000-8000-000000000002';
const draft = { name: 'پروژه تازه', key: 'NEW', color: 'teal', departmentId: 'product', description: '' } as const;
const serverProject: Project = {
  id: serverProjectId, name: draft.name, color: draft.color, departmentId: draft.departmentId,
  memberIds: ['owner'], starred: false, parentId: null,
};
const serverChannel: Conversation = {
  id: serverChannelId, kind: 'channel', title: draft.name, tone: draft.color,
  memberIds: ['owner'], pinned: false, muted: false, unreadCount: 0,
  topic: 'کانال پروژه', projectId: serverProjectId, archived: false, archiveManager: true,
};
const ack: WorkspaceAction = { type: 'sync/upsert-project', project: serverProject, replaceId: localProjectId };
const broadcast: WorkspaceAction = { type: 'sync/upsert-conversation', conversation: serverChannel };

function optimisticProject(): WorkspaceState {
  return workspaceReducer({ ...LIVE_EMPTY_STATE, meId: 'owner' }, {
    type: 'create-project', projectId: localProjectId, draft, ownerId: 'owner',
  });
}

describe('project companion channel identity synchronization', () => {
  it('replaying one optimistic project action does not synthesize another companion', () => {
    const state = optimisticProject();
    expect(workspaceReducer(state, { type: 'create-project', projectId: localProjectId, draft, ownerId: 'owner' })).toBe(state);
  });

  it.each(['response-first', 'broadcast-first'] as const)('keeps one canonical channel when %s', (order: 'response-first' | 'broadcast-first') => {
    let state = optimisticProject();
    state = workspaceReducer(state, order === 'response-first' ? ack : broadcast);
    state = workspaceReducer(state, order === 'response-first' ? broadcast : ack);
    // Replays and a second API refresh must remain idempotent.
    state = workspaceReducer(workspaceReducer(state, broadcast), broadcast);
    expect(state.projects.map((project) => project.id)).toEqual([serverProjectId]);
    expect(state.conversations).toEqual([serverChannel]);
  });

  it('reconciles a stale persisted companion by project identity, not title', () => {
    const stale = { ...serverChannel, id: 'stale-server-id' };
    const state = workspaceReducer({ ...LIVE_EMPTY_STATE, conversations: [stale] }, broadcast);
    expect(state.conversations).toEqual([serverChannel]);
    expect(workspaceReducer(state, broadcast).conversations).toEqual([serverChannel]);
  });

  it('replaces the project id on its optimistic companion before the server channel arrives', () => {
    const before = optimisticProject();
    const state = workspaceReducer(before, ack);
    expect(state.conversations).toEqual([{ ...before.conversations[0]!, projectId: serverProjectId }]);
  });

  it('preserves the selected thread, inspector and pending messages when replacing the companion', () => {
    let state = optimisticProject();
    const localChannel = state.conversations[0]!;
    const message: Message = {
      id: 'message-local-102', conversationId: localChannel.id, authorId: 'owner',
      sentAt: '2026-10-15T00:00:00.000Z', body: { kind: 'text', text: 'نخستین پیام' },
      replyToId: null, reactions: [], readByIds: [], linkedTaskId: null, edited: false,
    };
    state = { ...state, activeConversationId: localChannel.id,
      inspector: { kind: 'conversation', conversationId: localChannel.id },
      messages: [message], unreadByConversation: { [localChannel.id]: 0 } };
    state = workspaceReducer(workspaceReducer(state, broadcast), ack);
    expect(state.activeConversationId).toBe(serverChannelId);
    expect(state.inspector).toEqual({ kind: 'conversation', conversationId: serverChannelId });
    expect(state.messages).toEqual([{ ...message, conversationId: serverChannelId }]);
    expect(state.unreadByConversation).toEqual({ [serverChannelId]: 0 });
    expect(state.conversations).toEqual([serverChannel]);
  });

  it('keeps another project and unrelated same-title conversations distinct', () => {
    let state = optimisticProject();
    const otherChannel = { ...serverChannel, id: 'another-server-channel', projectId: 'another-project' };
    const sameTitleGroup: Conversation = { ...serverChannel, id: 'group-local-102', kind: 'group', projectId: null };
    state = { ...state, conversations: [...state.conversations, otherChannel, sameTitleGroup] };
    state = workspaceReducer(workspaceReducer(state, ack), broadcast);
    expect(state.conversations.map((conversation) => conversation.id).sort())
      .toEqual([serverChannelId, otherChannel.id, sameTitleGroup.id].sort());
  });

  it('keeps an explicit optimistic group replacement idempotent if realtime arrived first', () => {
    const group: Conversation = { ...serverChannel, id: 'server-group', kind: 'group', projectId: null };
    const local = { ...group, id: 'conv-local-103' };
    let state: WorkspaceState = { ...LIVE_EMPTY_STATE, conversations: [local] };
    state = workspaceReducer(state, { type: 'sync/upsert-conversation', conversation: group });
    state = workspaceReducer(state, { type: 'sync/upsert-conversation', conversation: group, replaceId: local.id });
    expect(state.conversations).toEqual([group]);
  });
});

describe('project creation without a socket notification', () => {
  it('reconciles the companion from the API instead of leaving a local-only ghost', async () => {
    const created: ProjectView = {
      ...serverProject, key: draft.key, description: '', departmentId: null, departmentIds: [],
      visibility: 'workspace', archived: false, myRole: 'lead', myActions: ['view'],
      taskCount: 0, openTaskCount: 0, createdAt: '2026-10-15T00:00:00.000Z',
    };
    const channel: ConversationView = {
      ...serverChannel, projectId: serverProjectId, membershipMode: 'project_synced',
      isPrivate: true, postPolicy: 'everyone', memberCount: 1, myRole: 'owner',
      mutedUntil: null, notificationLevel: 'all', hidden: false, lastSeq: 0, lastReadSeq: 0,
      lastMessage: null, lastMessageAt: null, archived: false, createdAt: created.createdAt,
    };
    vi.spyOn(api.projects, 'create').mockResolvedValue(created);
    vi.spyOn(api.workflow, 'list').mockResolvedValue([]);
    vi.spyOn(api.conversations, 'list').mockResolvedValue([channel]);
    const store = new LiveStore();
    // Begin at the loaded workspace boundary; socket transport stays disconnected.
    Object.assign(store, { status: { ...store.current, phase: 'ready' } });
    const previous = { ...LIVE_EMPTY_STATE, meId: 'owner' };
    const action: WorkspaceAction = { type: 'create-project', projectId: localProjectId, draft, ownerId: 'owner' };
    let state = workspaceReducer(previous, action);
    store.attach(() => state, (incoming) => { state = workspaceReducer(state, incoming); });
    store.effect(action, previous, state);
    const beforeReplay = state;
    state = workspaceReducer(state, action);
    store.effect(action, beforeReplay, state);
    // No realtime event is sent: the HTTP completion itself must discover the companion.
    await vi.waitFor(() => {
      expect(state.conversations).toEqual([serverChannel]);
    });
    expect(api.projects.create).toHaveBeenCalledTimes(1);
    expect(api.conversations.list).toHaveBeenCalledTimes(1);
  });
});
