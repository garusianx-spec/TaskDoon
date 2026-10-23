import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationView, DepartmentView, ProjectView, TaskStatus, WorkflowView } from '@taskin/contracts';
import { api } from '../src/api/endpoints';
import { ApiProblem } from '../src/api/http';
import { projectFromView } from '../src/api/mappers';
import { LIVE_EMPTY_STATE } from '../src/store/initial-state';
import { LiveStore } from '../src/store/live/live-store';
import { workspaceReducer, type ProjectDraft, type WorkspaceState } from '../src/store/workspace-reducer';

const workspaceId = '01900000-0000-7000-8000-000000000010';
const projectId = '01900000-0000-7000-8000-000000000011';
const departmentId = '01900000-0000-7000-8000-000000000012';
const customId = '01900000-0000-7000-8000-000000000013';
const commandId = '01900000-0000-7000-8000-000000000014';
const departments: DepartmentView[] = [{ id: departmentId, name: 'محصول', position: 0, memberCount: 1 }];
const draft: ProjectDraft = {
  name: 'پروژه مشترک', key: 'SHARED', color: 'violet', description: '', departmentId,
  departmentIds: [departmentId, 'custom-research'], customDepartments: [{ id: 'custom-research', name: 'پژوهش' }],
  memberIds: ['owner', 'member', 'member'],
};
const project: ProjectView = {
  id: projectId, name: draft.name, key: draft.key, color: draft.color, description: '',
  departmentId, departmentIds: [departmentId, customId], parentId: null, visibility: 'workspace',
  archived: false, starred: false, myRole: 'lead', myActions: ['view'], memberIds: ['owner', 'member'],
  taskCount: 0, openTaskCount: 0, createdAt: '2026-10-23T00:00:00.000Z',
};
const workflow: WorkflowView = {
  id: 'workflow', projectId, version: 1,
  columns: ['todo', 'in-progress', 'review', 'done'].map((status, index) => ({
    id: `column-${index}`, title: status, status: status as TaskStatus, builtIn: true, tone: null, position: `${index}`, deleted: false,
  })),
};
const channel: ConversationView = {
  id: 'channel', title: draft.name, kind: 'channel', projectId, membershipMode: 'project_synced',
  isPrivate: true, postPolicy: 'everyone', memberIds: project.memberIds, memberCount: 2, myRole: 'owner',
  mutedUntil: null, notificationLevel: 'all', hidden: false, pinned: false, lastSeq: 0, lastReadSeq: 0, unreadCount: 0,
  lastMessage: null, lastMessageAt: null, archived: false, createdAt: project.createdAt, tone: draft.color, topic: '',
};

function boundary() {
  let state: WorkspaceState = { ...LIVE_EMPTY_STATE, meId: 'owner', activeWorkspaceId: workspaceId, departments };
  const store = new LiveStore();
  Object.assign(store, { workspaceId, departments: new Map(departments.map(department => [department.id, department.name])) });
  store.attach(() => state, action => { state = workspaceReducer(state, action); });
  vi.spyOn(api.workflow, 'list').mockResolvedValue([workflow]);
  vi.spyOn(api.conversations, 'list').mockResolvedValue([channel]);
  return { store, state: () => state, replaceState: (next: WorkspaceState) => { state = next; } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('project creation persistence boundary', () => {
  it('stores multi-department and member selections in the demo project, board and one companion', () => {
    const base = { ...LIVE_EMPTY_STATE, departments };
    const action = { type: 'create-project' as const, projectId, draft, ownerId: 'owner' };
    const state = workspaceReducer(base, action);
    expect(state.projects[0]?.departmentIds).toEqual(draft.departmentIds);
    expect(state.projects[0]?.memberIds).toEqual(['owner', 'member']);
    expect(state.conversations[0]?.memberIds).toEqual(['owner', 'member']);
    expect(state.boardColumns).toHaveLength(4);
    expect(workspaceReducer(state, action)).toBe(state);
    expect(state.departments.filter(department => department.id === 'custom-research')).toHaveLength(1);
  });

  it('sends UUID department IDs, unique selected members and the same command key after a lost project response', async () => {
    const test = boundary();
    const storedDepartments = [...departments];
    const bodies: unknown[] = [];
    const keys: string[] = [];
    const committed = new Map<string, ProjectView>();
    let customCreates = 0;
    let loseReply = true;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/departments')) {
        if (options?.method === 'GET') return Response.json(storedDepartments);
        customCreates += 1;
        const custom = { id: customId, name: 'پژوهش', position: 1, memberCount: 0 };
        storedDepartments.push(custom);
        return Response.json(custom, { status: 201 });
      }
      const key = new Headers(options?.headers).get('idempotency-key')!;
      bodies.push(JSON.parse(String(options?.body))); keys.push(key);
      if (!committed.has(key)) committed.set(key, project);
      if (loseReply) { loseReply = false; throw new TypeError('Response lost after commit'); }
      return Response.json(committed.get(key), { status: 201 });
    }));
    await expect(test.store.createProject(draft, commandId)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(test.state().projects).toHaveLength(0);
    expect(await test.store.createProject(draft, commandId)).toBe(projectId);
    expect(customCreates).toBe(1);
    expect(committed.size).toBe(1);
    expect(keys).toEqual([commandId, commandId]);
    expect(bodies).toEqual([0, 1].map(() => ({ key: 'SHARED', name: draft.name, color: 'violet', departmentIds: [departmentId, customId], memberIds: ['owner', 'member'] })));
    expect(test.state().projects).toHaveLength(1);
    expect(test.state().projects[0]?.departmentIds).toEqual(project.departmentIds);
    expect(test.state().boardColumns).toHaveLength(4);
    expect(test.state().conversations).toHaveLength(1);
  });

  it('does not create a project when custom department authorization is refused', async () => {
    const test = boundary();
    vi.spyOn(api.departments, 'list').mockResolvedValue(departments);
    vi.spyOn(api.departments, 'create').mockRejectedValue(new ApiProblem(403, 'FORBIDDEN', 'Forbidden', null));
    const create = vi.spyOn(api.projects, 'create');
    await expect(test.store.createProject(draft, commandId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(create).not.toHaveBeenCalled();
    expect(test.state().projects).toEqual([]);
    expect(test.state().boardColumns).toEqual([]);
  });

  it('reuses a concurrently created department with an equivalent normalized name', async () => {
    const test = boundary();
    const existing = { id: customId, name: 'پژوهش', position: 1, memberCount: 0 };
    vi.spyOn(api.departments, 'list').mockResolvedValueOnce(departments).mockResolvedValue([...departments, existing]);
    vi.spyOn(api.departments, 'create').mockRejectedValue(new ApiProblem(409, 'CONFLICT', 'Exists', null));
    const create = vi.spyOn(api.projects, 'create').mockResolvedValue(project);
    await test.store.createProject(draft, commandId);
    expect(create).toHaveBeenCalledWith(workspaceId, expect.objectContaining({ departmentIds: [departmentId, customId] }), commandId);
  });

  it('refuses an unknown selected department instead of silently dropping it', async () => {
    const test = boundary();
    const create = vi.spyOn(api.projects, 'create');
    await expect(test.store.createProject({ ...draft, customDepartments: [], departmentIds: ['missing'] }, commandId))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('retains every server department through API mapping instead of collapsing custom departments', () => {
    expect(projectFromView(project, id => departments.find(department => department.id === id)?.name).departmentIds)
      .toEqual([departmentId, customId]);
  });

  it('does not merge a previous workspace board or channel when the person switches during confirmation', async () => {
    const test = boundary();
    vi.spyOn(api.projects, 'create').mockResolvedValue(project);
    let finishWorkflow!: (value: WorkflowView[]) => void;
    let finishChannels!: (value: ConversationView[]) => void;
    vi.mocked(api.workflow.list).mockImplementation(() => new Promise(resolve => { finishWorkflow = resolve; }));
    vi.mocked(api.conversations.list).mockImplementation(() => new Promise(resolve => { finishChannels = resolve; }));
    const creating = test.store.createProject({ ...draft, customDepartments: [], departmentIds: [departmentId] }, commandId);
    const rejected = expect(creating).rejects.toThrow('The active workspace changed.');
    await vi.waitFor(() => expect(api.workflow.list).toHaveBeenCalled());
    Object.assign(test.store, { workspaceId: 'another-workspace' });
    test.replaceState({ ...LIVE_EMPTY_STATE, activeWorkspaceId: 'another-workspace' });
    finishWorkflow([workflow]); finishChannels([channel]);
    await rejected;
    expect(test.state().projects).toEqual([]);
    expect(test.state().boardColumns).toEqual([]);
    expect(test.state().conversations).toEqual([]);
  });
});
