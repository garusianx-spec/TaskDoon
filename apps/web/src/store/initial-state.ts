import type { WorkspaceState } from './workspace-reducer';
import {
  ACTIVITY,
  CALENDAR_EVENTS,
  CONVERSATIONS,
  CURRENT_USER,
  CURRENT_USER_ID,
  INVITATIONS,
  LOGIN_SESSIONS,
  MESSAGES,
  NOTES,
  NOTIFICATIONS,
  PASSWORD_CHANGED_AT,
  PRIMARY_WORKSPACE_ID,
  PROJECTS,
  TASKS,
  USERS,
  WORKSPACES,
} from '@/data/workspace';
import { builtInColumnsFor, BUILT_IN_NOTE_CATEGORIES, DEFAULT_PERMISSION_MATRIX } from '@/data/reference';
import { IS_LIVE } from '@/lib/data-source';

/** The demo workspace (`NEXT_PUBLIC_DATA_SOURCE=demo`): the fixtures in `src/data`. */
export const DEMO_WORKSPACE_STATE: WorkspaceState = {
  session: 'active',
  meId: CURRENT_USER_ID,
  users: USERS,
  projects: PROJECTS,
  typingByConversation: {},
  focusedMessageId: null,
  workspaces: WORKSPACES,
  activeWorkspaceId: PRIMARY_WORKSPACE_ID,
  // The other seeded workspaces have not been worked in yet; they open empty.
  parkedWorkspaces: {},
  activity: ACTIVITY,
  tasks: TASKS,
  archivedTasks: [],
  // Every project has a board of its own, starting with the four built-in columns.
  boardColumns: PROJECTS.flatMap((project) => builtInColumnsFor(project.id)),
  conversations: CONVERSATIONS,
  messages: MESSAGES,
  calendarEvents: CALENDAR_EVENTS,
  calendarFocusDate: null,
  notes: NOTES,
  noteCategories: BUILT_IN_NOTE_CATEGORIES,
  notifications: NOTIFICATIONS,
  invitations: INVITATIONS,
  loginSessions: LOGIN_SESSIONS,
  twoFactorEnabled: false,
  passwordChangedAt: PASSWORD_CHANGED_AT,
  profile: { presence: CURRENT_USER.presence, statusMessage: '' },
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
  announcement: '',
};

/**
 * Before the API has answered: nothing at all. The live provider shows the sign-in screen or a
 * loading state until `sync/merge` fills this in, so no screen ever renders it.
 */
export const LIVE_EMPTY_STATE: WorkspaceState = {
  ...DEMO_WORKSPACE_STATE,
  meId: '',
  users: [],
  projects: [],
  workspaces: [],
  activeWorkspaceId: '',
  activity: [],
  tasks: [],
  boardColumns: [],
  conversations: [],
  messages: [],
  calendarEvents: [],
  notes: [],
  noteCategories: [],
  notifications: [],
  invitations: [],
  loginSessions: [],
  passwordChangedAt: new Date(0).toISOString(),
  profile: { presence: 'online', statusMessage: '' },
  pinnedConversationIds: [],
  mutedConversationIds: [],
  unreadByConversation: {},
  activeConversationId: '',
};

/**
 * The state a fresh session starts from. Kept apart from the provider so the reducer can
 * return to it on sign-out without importing React.
 */
export const INITIAL_WORKSPACE_STATE: WorkspaceState = IS_LIVE ? LIVE_EMPTY_STATE : DEMO_WORKSPACE_STATE;
