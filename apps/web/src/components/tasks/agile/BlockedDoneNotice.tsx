'use client';

import { useEffect } from 'react';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { IconButton } from '@/components/ui';
import { CloseIcon, WarningIcon } from '@/components/icons';

/** How long the warning stays up (it can always be closed sooner). */
const NOTICE_MS = 8_000;

/**
 * The non-blocking warning shown when a task reaches Done while a task it depends on is not done
 * yet. The move has already happened; this only says so. Renders nothing otherwise.
 */
export function BlockedDoneNotice() {
  const { state, dispatch } = useWorkspace();
  const notice = state.blockedDoneNotice ?? null;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dispatch({ type: 'dismiss-blocked-notice' }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);

  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-toast flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-lg animate-fade-in items-start gap-2.5 rounded-xl border border-status-progress-line bg-surface p-3 shadow-lg"
      >
        <WarningIcon size={20} className="mt-0.5 shrink-0 text-status-progress" />
        <p className="flex-1 text-body-sm leading-6 text-fg-primary">
          {`«${notice.title}» به «انجام شد» رفت، ولی هنوز منتظر ${notice.blockerCodes.join('، ')} است که تمام نشده.`}
        </p>
        <IconButton label="بستن هشدار" icon={<CloseIcon size={16} />} size="xs" variant="ghost" onClick={() => dispatch({ type: 'dismiss-blocked-notice' })} />
      </div>
    </div>
  );
}
