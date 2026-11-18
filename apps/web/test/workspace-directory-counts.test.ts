import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { ROLES } from '@/data/reference';
import { workspaceRoleCounts } from '@/features/workspace/lib/member-counts';
import { DirectoryPage } from '@/features/workspace/components/directory/DirectoryScreen';
import { NotesPage } from '@/features/notes/components/NotesScreen';

const fixture = vi.hoisted(() => ({ email: '', emptyNotes: false }));
vi.mock('@/store/WorkspaceProvider', async () => {
  const { DEMO_WORKSPACE_STATE: state } = await import('@/store/initial-state');
  return {
    useLive: () => null,
    useWorkspace: () => ({
      state: {
        ...state,
        notes: fixture.emptyNotes ? [] : state.notes,
        users: [{ ...state.users[0], role: 'owner', email: fixture.email }],
      },
      dispatch: () => undefined,
      currentUser: { ...state.users[0], role: 'owner', email: fixture.email },
      activeWorkspace: state.workspaces[0],
      isWorkspaceOwner: true,
    }),
  };
});
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/overlays/OverlayProvider', () => ({ useOverlays: () => ({ open: () => undefined }) }));

describe('synthetic active-workspace member fixtures', () => {
  it('shows one active owner rather than the static forty-four demo role counts', () => {
    const user = DEMO_WORKSPACE_STATE.users[0]!;
    const roles = workspaceRoleCounts([
      { ...user, role: 'owner' },
      { ...user, id: 'former', role: 'admin', former: true },
    ]);
    expect(roles.reduce((sum, role) => sum + role.memberCount, 0)).toBe(1);
    expect(roles.find((role) => role.id === 'owner')?.memberCount).toBe(1);
    expect(roles.find((role) => role.id === 'admin')?.memberCount).toBe(0);
    expect(roles.map(({ memberCount: _, ...definition }) => definition)).toEqual(
      ROLES.map(({ memberCount: _, ...definition }) => definition),
    );
    expect(workspaceRoleCounts([]).every((role) => role.memberCount === 0)).toBe(true);
  });
  it('renders no email action for empty or whitespace-only addresses', () => {
    for (const email of ['', '  ']) {
      fixture.email = email;
      expect(renderToStaticMarkup(createElement(DirectoryPage))).not.toContain('mailto:');
    }
    fixture.email = 'synthetic@example.test';
    expect(renderToStaticMarkup(createElement(DirectoryPage))).toContain('mailto:synthetic@example.test');
  });
  it('keeps mobile note creation in the header without duplicate empty-state actions', () => {
    fixture.emptyNotes = true;
    try {
      const html = renderToStaticMarkup(createElement(NotesPage));
      expect(html).toContain('یادداشتی پیدا نشد');
      expect(html).toContain('یادداشتی انتخاب نشده است');
      expect(html.match(/aria-label="یادداشت جدید"/g)).toHaveLength(1);
      expect(html).not.toContain('>یادداشت جدید</button>');
    } finally {
      fixture.emptyNotes = false;
    }
  });
});
