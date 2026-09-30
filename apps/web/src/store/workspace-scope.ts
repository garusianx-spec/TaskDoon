import type { WorkspaceState } from './workspace-reducer';
import { BUILT_IN_NOTE_CATEGORIES } from '@/data/reference';
import { DEFAULT_WORKING_HOURS } from '@/lib/working-hours';

/**
 * The slices that belong to one workspace. Switching workspaces parks the current values and
 * restores the target's; everything else — the session, the member's profile and security
 * settings, permissions, the theme — belongs to the account and survives a switch.
 */
export const SCOPED_KEYS = [
  'tasks',
  'archivedTasks',
  'boardColumns',
  'conversations',
  'messages',
  'calendarEvents',
  'notes',
  'noteCategories',
  'notifications',
  'invitations',
  'activity',
  'pinnedConversationIds',
  'mutedConversationIds',
  'unreadByConversation',
  'activeConversationId',
  'scheduledMessages',
  'workingHours',
] as const satisfies ReadonlyArray<keyof WorkspaceState>;

export type WorkspaceScope = Pick<WorkspaceState, (typeof SCOPED_KEYS)[number]>;

/** A workspace nobody has worked in yet: the default board columns and note categories. */
export const EMPTY_SCOPE: WorkspaceScope = {
  tasks: [],
  archivedTasks: [],
  // A new workspace has no projects yet, so no boards: each project brings its own columns.
  boardColumns: [],
  conversations: [],
  messages: [],
  calendarEvents: [],
  notes: [],
  noteCategories: BUILT_IN_NOTE_CATEGORIES,
  notifications: [],
  invitations: [],
  activity: [],
  pinnedConversationIds: [],
  mutedConversationIds: [],
  unreadByConversation: {},
  activeConversationId: '',
  scheduledMessages: [],
  workingHours: DEFAULT_WORKING_HOURS,
};

export function scopeOf(state: WorkspaceState): WorkspaceScope {
  return Object.fromEntries(SCOPED_KEYS.map((key) => [key, state[key]])) as unknown as WorkspaceScope;
}
