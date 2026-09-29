'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { Conversation, User, Workspace } from '@taskin/contracts';
import { IS_LIVE } from '@/lib/data-source';
import { workspaceReducer, type WorkspaceAction, type WorkspaceState } from './workspace-reducer';
import { INITIAL_WORKSPACE_STATE } from './initial-state';
import { setDirectory } from './directory';
import { LiveStore, type LiveStatus } from './live/live-store';
import { LiveGate } from '@/components/auth/LiveGate';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

interface WorkspaceContextValue {
  readonly state: WorkspaceState;
  readonly dispatch: Dispatch<WorkspaceAction>;
  readonly currentUser: User;
  readonly activeWorkspace: Workspace;
  /** True when the signed-in member is the active workspace's Owner. */
  readonly isWorkspaceOwner: boolean;
  readonly conversations: readonly Conversation[];
  /** Unread count with local "mark as read" applied on top of the seed value. */
  readonly unreadFor: (conversationId: string) => number;
  readonly isPinned: (conversationId: string) => boolean;
  readonly isMuted: (conversationId: string) => boolean;
  readonly totalUnread: number;
  readonly unreadNotifications: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** The API connection, for the few screens that talk to it directly (sign-in, typing). `null` in demo mode. */
const LiveContext = createContext<{ readonly store: LiveStore; readonly status: LiveStatus } | null>(null);

let liveStore: LiveStore | null = null;

/**
 * Single stateful container for the workspace. Every presentation component below this point
 * is pure: it receives data and callbacks and owns no domain state of its own.
 *
 * Every change goes through `dispatch`: the reducer applies it at once, and with the API as the
 * data source (`NEXT_PUBLIC_DATA_SOURCE=api`) the live store then sends it to the server and feeds
 * the server's answers and everyone else's changes back in as `sync/*` actions.
 */
export function WorkspaceProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(INITIAL_WORKSPACE_STATE);
  // The latest state, updated synchronously, so consecutive dispatches in one event build on each
  // other and the live store sees exactly the states before and after each action.
  const stateRef = useRef(state);

  const apply = useCallback((action: WorkspaceAction): { prev: WorkspaceState; next: WorkspaceState } => {
    const prev = stateRef.current;
    const next = workspaceReducer(prev, action);
    stateRef.current = next;
    if (next !== prev) setState(next);
    return { prev, next };
  }, []);

  const live = useMemo(() => {
    if (!IS_LIVE) return null;
    liveStore ??= new LiveStore();
    return liveStore;
  }, []);

  // Before any effect runs, so the store never reads a render React discarded (StrictMode).
  useIsomorphicLayoutEffect(() => {
    live?.attach(() => stateRef.current, (action) => void apply(action));
  }, [live, apply]);

  const dispatch = useCallback<Dispatch<WorkspaceAction>>(
    (action) => {
      const { prev, next } = apply(action);
      live?.effect(action, prev, next);
    },
    [apply, live],
  );

  const liveStatus = useSyncExternalStore(
    useCallback((listener: () => void) => live?.subscribe(listener) ?? (() => undefined), [live]),
    () => live?.current ?? DEMO_STATUS,
    () => SERVER_STATUS,
  );

  useEffect(() => {
    void live?.start();
  }, [live]);

  // Lookups by id (`userById`, `projectById`) read the directory; keep it equal to the state.
  setDirectory(state.users, state.projects, state.formerUsers);

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

  const unreadNotifications = useMemo(
    () => state.notifications.filter((notification) => !notification.read).length,
    [state.notifications],
  );

  // Presence is the one identity field the member edits themselves (profile modal); name,
  // email and title come from the organisation directory.
  const me = state.users.find((user) => user.id === state.meId);
  const currentUser = useMemo<User | undefined>(
    () => (me ? { ...me, presence: state.profile.presence } : undefined),
    [me, state.profile.presence],
  );

  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);

  const value = useMemo<WorkspaceContextValue | null>(
    () =>
      currentUser && activeWorkspace
        ? {
            state,
            dispatch,
            currentUser,
            activeWorkspace,
            isWorkspaceOwner: activeWorkspace.ownerId === currentUser.id,
            conversations: state.conversations,
            unreadFor,
            isPinned,
            isMuted,
            totalUnread,
            unreadNotifications,
          }
        : null,
    [state, dispatch, currentUser, activeWorkspace, unreadFor, isPinned, isMuted, totalUnread, unreadNotifications],
  );

  const liveValue = useMemo(() => (live ? { store: live, status: liveStatus } : null), [live, liveStatus]);

  if (live && liveValue) {
    return (
      <LiveContext.Provider value={liveValue}>
        <LiveGate status={liveStatus} store={live} ready={value !== null}>
          {value ? <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider> : null}
        </LiveGate>
      </LiveContext.Provider>
    );
  }

  // The demo workspace always has a member and an active workspace.
  if (!value) throw new Error('The demo workspace is missing its member or active workspace.');
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

const DEMO_STATUS: LiveStatus = { phase: 'ready', connection: 'online', user: null, toast: null };
/** What the server renders: the live app always starts by restoring the session in the browser. */
const SERVER_STATUS: LiveStatus = { phase: 'restoring', connection: 'offline', user: null, toast: null };

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside <WorkspaceProvider>.');
  return context;
}

/** The API connection, or `null` with the demo workspace. */
export function useLive(): { readonly store: LiveStore; readonly status: LiveStatus } | null {
  return useContext(LiveContext);
}
