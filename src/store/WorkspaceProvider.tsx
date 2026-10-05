'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { ActiveSession, Conversation, Project, User } from '@/types';
import {
  ACTIVE_SESSIONS,
  CONVERSATIONS,
  CURRENT_USER,
  MESSAGES,
  PROJECTS,
  TASKS,
} from '@/data/workspace';
import { DEFAULT_BOARD_COLUMNS, DEFAULT_PERMISSION_MATRIX } from '@/data/reference';
import { workspaceReducer, type WorkspaceAction, type WorkspaceState } from './workspace-reducer';

interface WorkspaceContextValue {
  readonly state: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
  /** The signed-in user, with any profile edits applied on top of the seed record. */
  readonly currentUser: User;
  readonly conversations: readonly Conversation[];
  readonly projects: readonly Project[];
  readonly sessions: readonly ActiveSession[];
  /** Unread count with local "mark as read" applied on top of the seed value. */
  readonly unreadFor: (conversationId: string) => number;
  readonly isPinned: (conversationId: string) => boolean;
  readonly isMuted: (conversationId: string) => boolean;
  readonly totalUnread: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const initialState: WorkspaceState = {
  tasks: TASKS,
  messages: MESSAGES,
  columns: DEFAULT_BOARD_COLUMNS,
  projects: PROJECTS,
  conversations: CONVERSATIONS,
  profile: {
    fullName: CURRENT_USER.fullName,
    jobTitle: CURRENT_USER.jobTitle,
    initials: CURRENT_USER.initials,
    avatarTone: CURRENT_USER.avatarTone,
    presence: CURRENT_USER.presence,
  },
  sessions: ACTIVE_SESSIONS,
  signedIn: true,
  assigneeFilterId: null,
  focusComposer: false,
  permissions: DEFAULT_PERMISSION_MATRIX,
  pinnedConversationIds: CONVERSATIONS.filter((conversation) => conversation.pinned).map((c) => c.id),
  mutedConversationIds: CONVERSATIONS.filter((conversation) => conversation.muted).map((c) => c.id),
  unreadByConversation: Object.fromEntries(
    CONVERSATIONS.map((conversation) => [conversation.id, conversation.unreadCount]),
  ),
  activeConversationId: CONVERSATIONS[0]?.id ?? '',
  inspector: { kind: 'none' },
  taskView: 'board',
  chatFilter: 'all',
  smartView: 'all',
  projectFilterId: null,
  chatSearch: '',
  taskSearch: '',
  jumpToMessageId: null,
  announcement: '',
};

/**
 * Single stateful container for the workspace. Every presentation component below this point
 * is pure: it receives data and callbacks and owns no domain state of its own.
 *
 * In production this is where the transport layer would live (React Query / server actions
 * feeding the same reducer); the reducer contract would not change.
 */
export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  const unreadFor = useCallback(
    (conversationId: string) => state.unreadByConversation[conversationId] ?? 0,
    [state.unreadByConversation],
  );

  const isPinned = useCallback(
    (conversationId: string) => state.pinnedConversationIds.includes(conversationId),
    [state.pinnedConversationIds],
  );

  const isMuted = useCallback(
    (conversationId: string) => state.mutedConversationIds.includes(conversationId),
    [state.mutedConversationIds],
  );

  const totalUnread = useMemo(
    () => Object.values(state.unreadByConversation).reduce((sum, count) => sum + count, 0),
    [state.unreadByConversation],
  );

  // Profile edits are layered over the seed record so every avatar and byline in the app
  // reflects them without duplicating the user list.
  const currentUser = useMemo<User>(
    () => ({ ...CURRENT_USER, ...state.profile }),
    [state.profile],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      dispatch,
      currentUser,
      conversations: state.conversations,
      projects: state.projects,
      sessions: state.sessions,
      unreadFor,
      isPinned,
      isMuted,
      totalUnread,
    }),
    [state, currentUser, unreadFor, isPinned, isMuted, totalUnread],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside <WorkspaceProvider>.');
  return context;
}
