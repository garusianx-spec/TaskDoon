export interface CriticalLoadModules {
  readonly conversations: boolean;
  readonly notifications: boolean;
  readonly activity: boolean;
  readonly calendar: boolean;
  readonly invitations: boolean;
  readonly notes: boolean;
  readonly sessions: boolean;
  readonly scheduled: boolean;
  readonly workingHours: boolean;
}

const ALL_MODULES: CriticalLoadModules = {
  conversations: true,
  notifications: true,
  activity: true,
  calendar: true,
  invitations: true,
  notes: true,
  sessions: true,
  scheduled: true,
  workingHours: true,
};

/**
 * Determines which non-core workspace modules must block initial `ready` paint for `pathname`.
 * Non-browser callers (`pathname === ''`) and `quiet` refreshes wait for all modules; browser
 * reloads on `/tasks` wait only on core workspace + task data while secondary modules hydrate in background.
 */
export function criticalModulesForPath(pathname: string, quiet = false): CriticalLoadModules {
  if (quiet || !pathname) return ALL_MODULES;
  if (pathname.startsWith('/chats')) {
    return {
      conversations: true,
      notifications: false,
      activity: false,
      calendar: false,
      invitations: false,
      notes: false,
      sessions: false,
      scheduled: true,
      workingHours: false,
    };
  }
  if (pathname.startsWith('/notes')) {
    return {
      conversations: false,
      notifications: false,
      activity: false,
      calendar: false,
      invitations: false,
      notes: true,
      sessions: false,
      scheduled: false,
      workingHours: false,
    };
  }
  if (pathname.startsWith('/calendar')) {
    return {
      conversations: false,
      notifications: false,
      activity: false,
      calendar: true,
      invitations: false,
      notes: false,
      sessions: false,
      scheduled: false,
      workingHours: false,
    };
  }
  if (pathname.startsWith('/feed')) {
    return {
      conversations: true,
      notifications: false,
      activity: true,
      calendar: true,
      invitations: false,
      notes: false,
      sessions: false,
      scheduled: false,
      workingHours: false,
    };
  }
  if (pathname.startsWith('/settings')) {
    return {
      conversations: false,
      notifications: false,
      activity: false,
      calendar: false,
      invitations: true,
      notes: false,
      sessions: true,
      scheduled: false,
      workingHours: true,
    };
  }
  return {
    conversations: false,
    notifications: false,
    activity: false,
    calendar: false,
    invitations: false,
    notes: false,
    sessions: false,
    scheduled: false,
    workingHours: false,
  };
}
