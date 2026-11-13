import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/endpoints';
import { LIVE_EMPTY_STATE } from '@/store/initial-state';
import { LiveStore } from '@/store/live/live-store';
import { workspaceReducer, type WorkspaceState } from '@/store/workspace-reducer';

afterEach(() => vi.restoreAllMocks());

describe('invitation persistence', () => {
  it('sends the workspace department ID and keeps the server-confirmed invitation', async () => {
    const store = new LiveStore();
    Object.assign(store, { workspaceId: 'workspace', departments: new Map([['department-id', 'پژوهش']]) });
    let state: WorkspaceState = LIVE_EMPTY_STATE;
    store.attach(
      () => state,
      (action) => { state = workspaceReducer(state, action); },
    );
    const invitation = {
      id: 'invitation',
      address: 'person@example.test',
      channel: 'email' as const,
      role: 'member' as const,
      departmentId: 'department-id',
      message: '',
      status: 'pending' as const,
      invitedById: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
    };
    const invite = vi.spyOn(api.workspaces, 'invite').mockResolvedValue({ created: [invitation], rejected: [] });
    const draft = {
      recipients: [{ address: 'person@example.test', channel: 'email' as const }],
      role: 'member' as const,
      department: 'department-id',
      message: '',
    };
    await store.inviteMembers(draft, 'same-command');
    await store.inviteMembers(draft, 'same-command');
    expect(invite).toHaveBeenCalledWith(
      'workspace',
      expect.objectContaining({ departmentId: 'department-id' }),
      'same-command',
    );
    expect(state.invitations).toHaveLength(1);
    expect(state.invitations[0]?.department).toBe('department-id');
  });

  it('does not add an optimistic invitation when validation fails', async () => {
    const store = new LiveStore();
    let state: WorkspaceState = LIVE_EMPTY_STATE;
    store.attach(
      () => state,
      (action) => { state = workspaceReducer(state, action); },
    );
    vi.spyOn(api.workspaces, 'invite').mockRejectedValue(new Error('invalid department'));
    await expect(
      store.inviteMembers(
        {
          recipients: [{ address: 'person@example.test', channel: 'email' }],
          role: 'member',
          department: 'foreign',
          message: '',
        },
        'command',
      ),
    ).rejects.toThrow();
    expect(state.invitations).toHaveLength(0);
  });
});
