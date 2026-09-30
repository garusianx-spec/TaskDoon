'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TaskDraft } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { OverlayContext, type Overlay, type OverlayContextValue } from './context';
import { OverlayHost } from './OverlayHost';

export { useOverlays, type Overlay, type OverlayKind } from './context';

/** Shortcuts shown in the quick-create menu. Matched on `code` so a Persian layout works too. */
const SHORTCUTS: Readonly<Record<string, Overlay>> = {
  KeyN: { kind: 'task-composer', draft: null },
  KeyM: { kind: 'conversation-composer' },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, [role="combobox"], [role="listbox"]')) return true;
  return false;
}

/**
 * Global store for dialog state. Lives above every route, so the task composer, the new-chat
 * dialog, the notification centre and the account dialogs can be opened from any component —
 * the rail, a board column, a calendar cell, a note — without prop-drilling, and they survive
 * the route change a flow sometimes triggers (e.g. creating a chat navigates to /chats).
 */
export function OverlayProvider({ children }: { readonly children: ReactNode }) {
  const { state } = useWorkspace();
  const [active, setActive] = useState<Overlay | null>(null);

  const open = useCallback((overlay: Overlay) => setActive(overlay), []);
  const close = useCallback(() => setActive(null), []);
  const openTaskComposer = useCallback(
    (draft: TaskDraft | null) => setActive({ kind: 'task-composer', draft }),
    [],
  );

  const signedIn = state.session === 'active';

  useEffect(() => {
    if (!signedIn || active !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const overlay = SHORTCUTS[event.code];
      if (!overlay) return;
      event.preventDefault();
      setActive(overlay);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [signedIn, active]);

  const value = useMemo<OverlayContextValue>(
    () => ({ active: signedIn ? active : null, open, close, openTaskComposer }),
    [signedIn, active, open, close, openTaskComposer],
  );

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <OverlayHost />
    </OverlayContext.Provider>
  );
}
