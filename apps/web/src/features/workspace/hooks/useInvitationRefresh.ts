import { useEffect } from 'react';
import { useLive } from '@/store/WorkspaceProvider';

/** Only while the pending invitations are visible. A failed read never erases their last known status. */
export function useInvitationRefresh(visible: boolean, workspaceId?: string) {
  const store = useLive()?.store;
  useEffect(() => {
    if (!visible || !store) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        await store.refreshInvitations();
      } catch {
        /* Keep the last confirmed result. */
      }
      if (active) timer = setTimeout(() => void refresh(), 10_000);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [visible, store, workspaceId]);
}
