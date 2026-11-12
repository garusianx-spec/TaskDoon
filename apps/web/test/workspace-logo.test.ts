import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceView } from '@taskin/contracts';
import { api } from '@/api/endpoints';
import { workspaceFromView } from '@/api/mappers';
import { workspaceIconError } from '@/features/workspace/lib/workspace-icon';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { LiveStore } from '@/store/live/live-store';
import { workspaceReducer } from '@/store/workspace-reducer';

const existing = DEMO_WORKSPACE_STATE.workspaces[0]!;
const image = new File(['raster'], 'logo.png', { type: 'image/png' });
const iconUrl = 'https://storage.example.test/signed-logo.png';
const view: WorkspaceView = {
  ...existing,
  slug: 'workspace',
  iconUrl,
  planId: 'free',
  limits: { maxMembers: 10, storageBytes: 100, maxFileBytes: 10, messageHistoryDays: null, maxProjects: 5 },
  settings: {
    timeZone: 'Asia/Tehran',
    weekStart: 'saturday',
    weekend: ['friday'],
    systemMessageOnConvert: true,
    allowedEmailDomains: [],
  },
  createdAt: '2026-10-15T00:00:00.000Z',
};

function loadedWorkspace() {
  let state = DEMO_WORKSPACE_STATE;
  const store = new LiveStore();
  Object.assign(store, {
    workspaceId: existing.id,
    status: { ...store.current, phase: 'ready', user: { id: state.meId } },
  });
  store.attach(
    () => state,
    (action) => {
      state = workspaceReducer(state, action);
    },
  );
  return { store, getState: () => state };
}

function issueTicket() {
  return vi.spyOn(api.files, 'iconTicket').mockResolvedValue({
    key: 'tmp/icons/member/logo',
    url: 'https://storage.example.test/upload',
    fields: { key: 'tmp/icons/member/logo' },
    maxBytes: 1024 * 1024,
    contentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    expiresInSeconds: 600,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace logo updates', () => {
  it('accepts only supported nonempty images within the server size limit', () => {
    expect(workspaceIconError(image)).toBeUndefined();
    expect(workspaceIconError(new File(['raster'], 'logo.jpg'))).toBeUndefined();
    expect(workspaceIconError(new File(['vector'], 'logo.svg', { type: 'image/svg+xml' }))).toBeDefined();
    expect(workspaceIconError(new File([], 'logo.png', { type: 'image/png' }))).toBeDefined();
    expect(
      workspaceIconError(new File([new Uint8Array(1024 * 1024 + 1)], 'logo.png', { type: 'image/png' })),
    ).toBeDefined();
  });

  it('uploads before claiming the key and adopts the canonical workspace response', async () => {
    const { store, getState } = loadedWorkspace();
    const ticket = issueTicket();
    const upload = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', upload);
    const update = vi.spyOn(api.workspaces, 'update').mockResolvedValue(view);

    await store.saveWorkspaceIcon(existing.id, image);

    expect(ticket).toHaveBeenCalledBefore(upload);
    expect(upload).toHaveBeenCalledBefore(update);
    expect(update).toHaveBeenCalledWith(existing.id, { iconUploadKey: 'tmp/icons/member/logo' });
    expect(getState().workspaces[0]).toEqual(workspaceFromView(view));
    expect(getState().workspaces.slice(1)).toEqual(DEMO_WORKSPACE_STATE.workspaces.slice(1));
  });

  it('leaves the workspace alone when storage rejects the upload and removes via an explicit null', async () => {
    const { store, getState } = loadedWorkspace();
    const ticket = issueTicket();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    const update = vi.spyOn(api.workspaces, 'update').mockResolvedValue({ ...view, iconUrl: null });

    await expect(store.saveWorkspaceIcon(existing.id, image)).rejects.toMatchObject({
      code: 'UPLOAD_INVALID',
    });
    expect(update).not.toHaveBeenCalled();
    expect(getState()).toBe(DEMO_WORKSPACE_STATE);

    await store.saveWorkspaceIcon(existing.id, null);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(existing.id, { iconUploadKey: null });
    expect(getState().workspaces[0]?.iconUrl).toBeNull();
  });
});
