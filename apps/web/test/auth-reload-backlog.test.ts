import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeUser, ProjectView, TaskCard, WorkflowView, WorkspaceView } from '@taskin/contracts';
import { api } from '@/api/endpoints';
import { session } from '@/features/auth/api/session';
import { resolveGateView } from '@/features/auth/components/LiveGate';
import { parseTaskViewParam, taskViewHref } from '@/features/board/lib/task-view';
import { criticalModulesForPath } from '@/store/live/load-plan';
import { LiveStore } from '@/store/live/live-store';
import { LIVE_EMPTY_STATE } from '@/store/initial-state';
import { workspaceReducer, type WorkspaceState } from '@/store/workspace-reducer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const workspaceId = 'ws-reload-1';
const userId = 'user-reload-1';
const projectId = 'proj-reload-1';
const columnId = 'col-todo-1';

const meUser: MeUser = {
  id: userId,
  phone: '+989121112233',
  email: 'qa@example.com',
  fullName: 'سارا رضایی',
  avatarTone: 'brand',
  locale: 'fa-IR',
  timeZone: 'Asia/Tehran',
  hasPassword: true,
};

const workspaceView: WorkspaceView = {
  id: workspaceId,
  slug: 'ws-reload-1',
  name: 'فضای کاری آزمون',
  description: '',
  initials: 'فا',
  tone: 'brand',
  iconUrl: null,
  planId: 'team',
  limits: {
    maxMembers: 20,
    storageBytes: 1024 * 1024 * 100,
    maxFileBytes: 1024 * 1024 * 10,
    messageHistoryDays: null,
    maxProjects: 50,
  },
  settings: {
    timeZone: 'Asia/Tehran',
    weekStart: 'saturday',
    weekend: ['friday'],
    systemMessageOnConvert: true,
    allowedEmailDomains: [],
  },
  memberCount: 1,
  ownerId: userId,
  createdAt: '2026-11-01T00:00:00Z',
};

const projectView: ProjectView = {
  id: projectId,
  name: 'پروژه آزمون',
  departmentId: null,
  departmentIds: [],
  color: 'brand',
  starred: false,
  parentId: null,
  memberIds: [userId],
  archived: false,
  key: 'TST',
  description: '',
  visibility: 'workspace',
  myRole: 'lead',
  myActions: ['view'],
  taskCount: 1,
  openTaskCount: 1,
  createdAt: '2026-11-01T00:00:00Z',
};

const workflowView: WorkflowView = {
  id: 'wf-reload-1',
  projectId,
  version: 1,
  columns: [
    {
      id: columnId,
      title: 'انجام شود',
      status: 'todo',
      tone: 'gray',
      position: 'a',
      builtIn: true,
    },
  ],
};

const taskCard: TaskCard = {
  id: 'task-backlog-1',
  code: 'TST-1',
  title: 'وظیفه بک‌لاگ',
  status: 'todo',
  priority: 'medium',
  projectId,
  assigneeIds: [userId],
  reviewerId: null,
  startDate: '2026-11-18',
  dueDate: '2026-11-20',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  completedAt: null,
  archived: false,
  labelIds: [],
  starred: false,
  sourceMessageId: null,
  sourceNoteId: null,
  columnId,
  position: 'a',
  type: 'feature',
  severity: null,
  estimatedMinutes: null,
  spentMinutes: 0,
  isBacklog: true,
  blockedByIds: [],
  version: 1,
  subtaskCount: 0,
  subtaskDoneCount: 0,
  commentCount: 0,
  attachmentCount: 0,
};

describe('gate state separation (unresolved loading vs signed-out)', () => {
  it('never maps restoring, loading, or unready states to signed-out', () => {
    expect(resolveGateView('restoring', false)).toBe('loading');
    expect(resolveGateView('restoring', true)).toBe('loading');
    expect(resolveGateView('loading', false)).toBe('loading');
    expect(resolveGateView('loading', true)).toBe('loading');
    expect(resolveGateView('ready', false)).toBe('loading');
    expect(resolveGateView('ready', true)).toBe('ready');
    expect(resolveGateView('signed-out', false)).toBe('signed-out');
    expect(resolveGateView('restore-error', false)).toBe('restore-error');
    expect(resolveGateView('no-workspace', false)).toBe('no-workspace');
  });
});

describe('task view URL parsing and link construction', () => {
  it('parses valid view params and ignores unknown values', () => {
    expect(parseTaskViewParam('backlog')).toBe('backlog');
    expect(parseTaskViewParam('board')).toBe('board');
    expect(parseTaskViewParam('list')).toBe('list');
    expect(parseTaskViewParam('gantt')).toBe('gantt');
    expect(parseTaskViewParam('unknown')).toBeNull();
    expect(parseTaskViewParam('')).toBeNull();
    expect(parseTaskViewParam(null)).toBeNull();
  });

  it('builds URLs preserving non-view query parameters', () => {
    const params = new URLSearchParams('project=p1&view=backlog');
    expect(taskViewHref('/tasks', params, 'backlog')).toBe('/tasks?project=p1&view=backlog');
    expect(taskViewHref('/tasks', params, 'list')).toBe('/tasks?project=p1&view=list');
    expect(taskViewHref('/tasks', params, 'board')).toBe('/tasks?project=p1');
    expect(taskViewHref('/tasks', new URLSearchParams(), 'board')).toBe('/tasks');
  });
});

describe('route-aware critical loading plan', () => {
  it('defers unrelated modules on /tasks while keeping route-specific modules critical', () => {
    const tasksPlan = criticalModulesForPath('/tasks');
    expect(Object.values(tasksPlan).every((value) => value === false)).toBe(true);

    expect(criticalModulesForPath('/chats').conversations).toBe(true);
    expect(criticalModulesForPath('/notes').notes).toBe(true);
    expect(criticalModulesForPath('/calendar').calendar).toBe(true);
    expect(criticalModulesForPath('/feed').activity).toBe(true);
    expect(criticalModulesForPath('/tasks', true).notes).toBe(true);
    expect(criticalModulesForPath('').notes).toBe(true);
  });

  it('reaches ready on /tasks without waiting for slow deferred modules, then merges them', async () => {
    vi.stubGlobal('window', { location: { pathname: '/tasks' } });

    let resolveNotes!: (items: []) => void;
    const pendingNotes = new Promise<[]>((done) => {
      resolveNotes = done;
    });

    vi.spyOn(session, 'restore').mockResolvedValue({
      sessionId: 'sess-1',
      accessToken: 'tok-1',
      expiresAt: Date.now() + 60_000,
      user: meUser,
    });
    vi.spyOn(api.me, 'get').mockResolvedValue({
      user: meUser,
      workspaces: [
        {
          id: workspaceId,
          slug: 'ws-reload-1',
          name: workspaceView.name,
          initials: workspaceView.initials,
          tone: workspaceView.tone,
          iconUrl: null,
          role: 'owner',
          isOwner: true,
          suspended: false,
        },
      ],
    });
    vi.spyOn(api.workspaces, 'get').mockResolvedValue(workspaceView);
    vi.spyOn(api.workspaces, 'members').mockResolvedValue([
      {
        userId,
        fullName: meUser.fullName,
        jobTitle: 'مدیر',
        role: 'owner',
        isOwner: true,
        departmentId: null,
        online: true,
        presence: 'online',
        avatarTone: 'brand',
        email: meUser.email,
        phone: meUser.phone,
        status: 'active',
        statusMessage: '',
        joinedAt: '2026-11-01T00:00:00Z',
      },
    ]);
    vi.spyOn(api.departments, 'list').mockResolvedValue([]);
    vi.spyOn(api.projects, 'list').mockResolvedValue([projectView]);
    vi.spyOn(api.workflow, 'list').mockResolvedValue([workflowView]);
    vi.spyOn(api.tasks, 'all').mockResolvedValue([taskCard]);
    vi.spyOn(api.workspaces, 'roles').mockResolvedValue([]);
    vi.spyOn(api.conversations, 'list').mockResolvedValue([]);
    vi.spyOn(api.me, 'notifications').mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
    vi.spyOn(api, 'activity').mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(api.calendar, 'range').mockResolvedValue({
      from: '2026-10-01',
      to: '2026-12-31',
      timeZone: 'Asia/Tehran',
      events: [],
      deadlines: [],
    });
    vi.spyOn(api.workspaces, 'invitations').mockResolvedValue([]);
    vi.spyOn(api.notes, 'categories').mockResolvedValue([]);
    vi.spyOn(api.notes, 'all').mockReturnValue(pendingNotes);
    vi.spyOn(api.sessions, 'list').mockResolvedValue([]);
    vi.spyOn(api.scheduled, 'list').mockResolvedValue([]);
    vi.spyOn(api.workingHours, 'get').mockResolvedValue({
      autoReplyEnabled: false,
      days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'],
      start: '09:00',
      end: '17:00',
      message: '',
      timeZone: 'Asia/Tehran',
      updatedAt: '2026-11-01T00:00:00Z',
    });

    const store = new LiveStore();
    let state: WorkspaceState = LIVE_EMPTY_STATE;
    store.attach(
      () => state,
      (action) => {
        state = workspaceReducer(state, action);
      },
    );

    await store.start();
    expect(store.current.phase).toBe('ready');
    expect(state.tasks.map((task) => task.id)).toEqual(['task-backlog-1']);

    resolveNotes([]);
    await Promise.resolve();
  });
});
