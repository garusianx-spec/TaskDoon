'use client';

import { createContext, useContext } from 'react';
import type { TaskDraft } from '@taskin/contracts';

/**
 * Every app-level dialog, as one closed union. Only one is open at a time: each of them is a
 * modal (or a modal drawer) that owns focus, so stacking two would leave the first one inert
 * behind the second anyway.
 */
export type Overlay =
  | { readonly kind: 'task-composer'; readonly draft: TaskDraft | null }
  | { readonly kind: 'conversation-composer' }
  | { readonly kind: 'event-composer'; readonly date: string | null }
  | { readonly kind: 'invite-member' }
  | { readonly kind: 'project-composer' }
  /** Workspace owner only: a project to the trash, and the trash itself. */
  | { readonly kind: 'project-delete'; readonly projectId: string }
  | { readonly kind: 'project-trash' }
  | { readonly kind: 'workspace-create' }
  | { readonly kind: 'workspace-settings' }
  | { readonly kind: 'workspace-delete'; readonly workspaceId: string }
  | { readonly kind: 'profile' }
  | { readonly kind: 'security' }
  /** Phase 3.2: working hours and the out-of-office auto-reply. */
  | { readonly kind: 'working-hours' }
  | { readonly kind: 'sign-out' }
  | { readonly kind: 'global-search' }
  | { readonly kind: 'notifications' };

export type OverlayKind = Overlay['kind'];

export interface OverlayContextValue {
  readonly active: Overlay | null;
  readonly open: (overlay: Overlay) => void;
  readonly close: () => void;
  /** Shorthand for the most common entry point. Pass a draft to pre-fill the composer. */
  readonly openTaskComposer: (draft: TaskDraft | null) => void;
}

export const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlays(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) throw new Error('useOverlays must be used inside <OverlayProvider>.');
  return context;
}
