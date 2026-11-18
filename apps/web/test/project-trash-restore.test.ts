import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ConversationView,
  DepartmentView,
  MeResponse,
  ProjectView,
  TaskCard,
  TaskStatus,
  TrashedProjectView,
  WorkflowView,
  WorkspaceView,
} from '@taskin/contracts';
import { api } from '@/api/endpoints';
import { trashedProjectFromView } from '@/api/mappers';
import { ApiProblem } from '@/lib/api-client';
import { DEMO_WORKSPACE_STATE, LIVE_EMPTY_STATE } from '@/store/initial-state';
import { LiveStore } from '@/store/live/live-store';
import { workspaceReducer, type WorkspaceState } from '@/store/workspace-reducer';

const workspaceId = '01900000-0000-7000-8000-000000000010';
const ownerId = '01900000-0000-7000-8000-000000000001';
const deptId = '01900000-0000-7000-8000-000000000020';
const projId = '01900000-0000-7000-8000-000000000099';
const otherTrashedId = '01900000-0000-7000-8000-000000000097';
const chanId = '01900000-0000-7000-8000-000000000098';
const taskId = '01900000-0000-7000-8000-000000000201';
const now = '2026-11-18T10:00:00.000Z';
const purgeAt = '2026-12-28T10:00:00.000Z';

const departments: DepartmentView[] = [{ id: deptId, name: 'محصول', position: 0, memberCount: 1 }];

const projectView: ProjectView = {
  id: projId,
  key: 'QA99',
  name: 'پروژه آزمایشی بازیابی',
  description: 'پروژه ساختگی برای آزمون بازیابی',
  departmentId: deptId,
  departmentIds: [deptId],
  color: 'violet',
  parentId: null,
  visibility: 'workspace',
  archived: false,
  starred: false,
  myRole: 'lead',
  myActions: ['view', 'create', 'edit', 'delete'],
  memberIds: [ownerId],
  taskCount: 1,
  openTaskCount: 1,
  createdAt: now,
};

const trashedView: TrashedProjectView = {
  id: projId,
  key: 'QA99',
  name: projectView.name,
  color: 'violet',
  departmentId: deptId,
  taskCount: 1,
  deletedAt: now,
  deletedBy: ownerId,
  purgeAt,
};

const otherTrashedView: TrashedProjectView = {
  id: otherTrashedId,
  key: 'QA97',
  name: 'پروژه دیگر در سطل زباله',
  color: 'teal',
  departmentId: deptId,
  taskCount: 0,
  deletedAt: now,
  deletedBy: ownerId,
  purgeAt,
};

const workflowView: WorkflowView = {
  id: 'wf-1',
  projectId: projId,
  version: 1,
  columns: (['todo', 'in-progress', 'review', 'done'] as const).map((status, index) => ({
    id: `col-${index}`,
    title: status,
    status: status as TaskStatus,
    builtIn: true,
    tone: null,
    position: String(index),
  })),
};

const taskCard: TaskCard = {
  id: taskId,
  code: 'QA99-1',
  projectId: projId,
  title: 'وظیفه آزمایشی بازیابی',
  status: 'todo',
  priority: 'medium',
  columnId: 'col-0',
  position: '1',
  assigneeIds: [ownerId],
  reviewerId: null,
  startDate: '2026-11-18',
  dueDate: null,
  labelIds: [],
  starred: false,
  subtaskCount: 0,
  subtaskDoneCount: 0,
  commentCount: 0,
  attachmentCount: 0,
  completedAt: null,
  archived: false,
  sourceMessageId: null,
  sourceNoteId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  type: 'task',
  severity: null,
  estimatedMinutes: null,
  spentMinutes: 0,
  isBacklog: false,
  blockedByIds: [],
};

const archivedChannel: ConversationView = {
  id: chanId,
  title: projectView.name,
  kind: 'channel',
  projectId: projId,
  membershipMode: 'project_synced',
  isPrivate: true,
  postPolicy: 'everyone',
  memberIds: [ownerId],
  memberCount: 1,
  myRole: 'owner',
  mutedUntil: null,
  notificationLevel: 'all',
  hidden: false,
  pinned: false,
  lastSeq: 0,
  lastReadSeq: 0,
  unreadCount: 0,
  lastMessage: null,
  lastMessageAt: null,
  archived: true,
  createdAt: now,
  tone: 'violet',
  topic: '',
};

const meResponse: MeResponse = {
  user: {
    id: ownerId,
    phone: '+989121112233',
    email: 'qa-owner@example.com',
    fullName: 'مالک آزمایشی',
    avatarTone: 'brand',
    locale: 'fa-IR',
    timeZone: 'Asia/Tehran',
    hasPassword: true,
  },
  workspaces: [
    {
      id: workspaceId,
      slug: 'qa-ws',
      name: 'فضای آزمایشی',
      initials: 'فآ',
      tone: 'brand',
      iconUrl: null,
      role: 'owner',
      isOwner: true,
    },
  ],
};

const workspaceView: WorkspaceView = {
  id: workspaceId,
  slug: 'qa-ws',
  name: 'فضای آزمایشی',
  description: '',
  initials: 'فآ',
  tone: 'brand',
  iconUrl: null,
  ownerId,
  planId: 'team',
  limits: { maxMembers: 50, storageBytes: 1e9, maxFileBytes: 1e7, messageHistoryDays: null, maxProjects: 50 },
  memberCount: 1,
  settings: {
    timeZone: 'Asia/Tehran',
    weekStart: 'saturday',
    weekend: ['friday'],
    systemMessageOnConvert: true,
    allowedEmailDomains: [],
  },
  createdAt: now,
};

function stubLoadEndpoints(options: {
  readonly projects: () => ProjectView[];
  readonly trash: () => TrashedProjectView[];
  readonly tasks?: () => TaskCard[];
  readonly workflows?: () => WorkflowView[];
}) {
  vi.spyOn(api.me, 'get').mockResolvedValue(meResponse);
  vi.spyOn(api.workspaces, 'get').mockResolvedValue(workspaceView);
  vi.spyOn(api.workspaces, 'members').mockResolvedValue([
    {
      userId: ownerId,
      fullName: meResponse.user.fullName,
      phone: meResponse.user.phone,
      email: meResponse.user.email,
      avatarTone: 'brand',
      role: 'owner',
      isOwner: true,
      departmentId: deptId,
      jobTitle: 'مدیر',
      status: 'active',
      presence: 'online',
      online: true,
      statusMessage: '',
      joinedAt: now,
    },
  ]);
  vi.spyOn(api.departments, 'list').mockResolvedValue(departments);
  vi.spyOn(api.projects, 'list').mockImplementation(async () => options.projects());
  vi.spyOn(api.projects, 'trash').mockImplementation(async () => options.trash());
  vi.spyOn(api.workflow, 'list').mockImplementation(async () => options.workflows?.() ?? []);
  vi.spyOn(api.tasks, 'all').mockImplementation(async () => options.tasks?.() ?? []);
  vi.spyOn(api.conversations, 'list').mockResolvedValue([archivedChannel]);
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
  vi.spyOn(api.workspaces, 'roles').mockResolvedValue([]);
  vi.spyOn(api.notes, 'categories').mockResolvedValue([]);
  vi.spyOn(api.notes, 'all').mockResolvedValue([]);
  vi.spyOn(api.sessions, 'list').mockResolvedValue([]);
  vi.spyOn(api.scheduled, 'list').mockResolvedValue([]);
  vi.spyOn(api.workingHours, 'get').mockRejectedValue(new ApiProblem(404, 'NOT_FOUND', 'none', null));
}

function createHarness() {
  const trashEntries = [
    trashedProjectFromView(trashedView, () => 'محصول'),
    trashedProjectFromView(otherTrashedView, () => 'محصول'),
  ];
  let state: WorkspaceState = {
    ...LIVE_EMPTY_STATE,
    meId: ownerId,
    activeWorkspaceId: workspaceId,
    departments,
    workspaces: [
      {
        id: workspaceId,
        name: 'فضای آزمایشی',
        description: '',
        initials: 'فآ',
        tone: 'brand',
        iconUrl: null,
        plan: 'تیمی',
        memberCount: 1,
        ownerId,
      },
    ],
    projectTrash: trashEntries,
  };
  const store = new LiveStore();
  Object.assign(store, {
    workspaceId,
    trashLoaded: true,
    status: { ...store.current, phase: 'ready' as const },
    departments: new Map([[deptId, 'محصول']]),
    realtime: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      typing: vi.fn(),
      refreshToken: vi.fn(),
    },
  });
  store.attach(
    () => state,
    (action) => {
      state = workspaceReducer(state, action);
    },
  );
  return {
    store,
    state: () => state,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('project trash and restore reliability', () => {
  it('keeps the project recoverable in Trash on restore failure and restores cleanly on retry', async () => {
    const test = createHarness();
    let trashed = true;
    stubLoadEndpoints({
      projects: () => (trashed ? [] : [projectView]),
      trash: () => (trashed ? [trashedView, otherTrashedView] : [otherTrashedView]),
      tasks: () => (trashed ? [] : [taskCard]),
      workflows: () => (trashed ? [] : [workflowView]),
    });
    const restoreSpy = vi
      .spyOn(api.projects, 'restore')
      .mockRejectedValueOnce(new ApiProblem(500, 'INTERNAL', 'خطای سرور در بازیابی', null))
      .mockImplementationOnce(async () => {
        trashed = false;
        return projectView;
      });

    await expect(test.store.restoreProject(projId)).rejects.toMatchObject({ code: 'INTERNAL' });

    // Failed restore must keep the project recoverable in Trash and absent from active projects.
    expect(test.state().projects).toEqual([]);
    expect(test.state().projectTrash.map((entry) => entry.project.id)).toEqual([projId, otherTrashedId]);

    // Retrying restore succeeds cleanly: exactly one active project, absent from Trash, relationships intact.
    await test.store.restoreProject(projId);
    expect(restoreSpy).toHaveBeenCalledTimes(2);
    expect(test.state().projects.filter((project) => project.id === projId)).toHaveLength(1);
    expect(test.state().projects[0]?.departmentIds).toEqual([deptId]);
    expect(test.state().projects[0]?.memberIds).toEqual([ownerId]);
    expect(test.state().projectTrash.map((entry) => entry.project.id)).toEqual([otherTrashedId]);
    expect(test.state().tasks.map((task) => task.id)).toEqual([taskId]);
    expect(test.state().boardColumns.filter((col) => col.projectId === projId)).toHaveLength(4);
    expect(test.state().conversations.find((c) => c.id === chanId)?.archived).toBe(true);
  });

  it('refreshes stale Trash entries when restore reports NOT_FOUND', async () => {
    const test = createHarness();
    stubLoadEndpoints({
      projects: () => [],
      trash: () => [otherTrashedView],
    });
    vi.spyOn(api.projects, 'restore').mockRejectedValue(new ApiProblem(404, 'NOT_FOUND', 'gone', null));

    await expect(test.store.restoreProject(projId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(test.state().projectTrash.map((entry) => entry.project.id)).toEqual([otherTrashedId]);
  });

  it('waits for an in-flight delete-project before reading server Trash so opening Trash does not flash empty', async () => {
    const test = createHarness();
    let resolveDelete!: () => void;
    let deletedOnServer = false;
    vi.spyOn(api.projects, 'remove').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => {
            deletedOnServer = true;
            resolve();
          };
        }),
    );
    const trashSpy = vi
      .spyOn(api.projects, 'trash')
      .mockImplementation(async () => (deletedOnServer ? [trashedView] : []));

    test.store.effect({ type: 'delete-project', projectId: projId }, test.state(), test.state());
    test.store.effect({ type: 'load-project-trash' }, test.state(), test.state());

    await vi.waitFor(() => expect(resolveDelete).toBeTypeOf('function'));
    expect(trashSpy).not.toHaveBeenCalled();
    resolveDelete();
    await vi.waitFor(() =>
      expect(test.state().projectTrash.map((entry) => entry.project.id)).toEqual([projId]),
    );
  });

  it('deduplicates active projects, tasks, and columns across repeated delete and restore cycles in demo mode', () => {
    const project = DEMO_WORKSPACE_STATE.projects[0]!;
    const companion = {
      ...DEMO_WORKSPACE_STATE.conversations[0]!,
      id: 'companion',
      kind: 'channel' as const,
      projectId: project.id,
    };
    let state: WorkspaceState = { ...DEMO_WORKSPACE_STATE, conversations: [companion] };
    const initialTaskIds = state.tasks.filter((t) => t.projectId === project.id).map((t) => t.id);
    const initialColIds = state.boardColumns.filter((c) => c.projectId === project.id).map((c) => c.id);

    for (let cycle = 0; cycle < 2; cycle += 1) {
      state = workspaceReducer(state, { type: 'delete-project', projectId: project.id });
      expect(state.projects.some((p) => p.id === project.id)).toBe(false);
      expect(state.projectTrash.filter((t) => t.project.id === project.id)).toHaveLength(1);

      state = workspaceReducer(state, { type: 'restore-project', projectId: project.id });
      expect(state.projects.filter((p) => p.id === project.id)).toHaveLength(1);
      expect(state.projectTrash.some((t) => t.project.id === project.id)).toBe(false);
      expect(state.tasks.filter((t) => t.projectId === project.id).map((t) => t.id)).toEqual(initialTaskIds);
      expect(state.boardColumns.filter((c) => c.projectId === project.id).map((c) => c.id)).toEqual(
        initialColIds,
      );
      expect(state.conversations.find((c) => c.id === companion.id)?.archived).toBe(true);
    }
  });
});
