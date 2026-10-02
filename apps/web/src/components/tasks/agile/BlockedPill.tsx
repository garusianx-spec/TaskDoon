'use client';

import type { Task } from '@taskin/contracts';
import { openBlockers } from '@/lib/agile';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { Badge } from '@/components/ui';
import { LockIcon } from '@/components/icons';

/**
 * «مسدود» while a task blocking this one is not done (a done task is past waiting). Mount it
 * only for tasks that have blockers at all, so every other card renders exactly as before.
 */
export function BlockedPill({ task }: { readonly task: Task }) {
  const { state } = useWorkspace();
  const blockers = openBlockers(task, state.tasks);
  if (blockers.length === 0 || task.status === 'done') return null;
  return (
    <span title={`منتظر ${blockers.map((blocker) => blocker.code).join('، ')}`} className="inline-flex">
      <Badge tone="blocked" size="sm" iconStart={<LockIcon size={11} />}>
        مسدود
      </Badge>
    </span>
  );
}
