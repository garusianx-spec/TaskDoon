'use client';

import { useCallback, useState } from 'react';
import type { Task } from '@taskin/contracts';
import { formatDuration } from '@/lib/duration';
import { userById } from '@/store/selectors';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { Avatar, Button, IconButton, ProgressBar, RelativeTime } from '@/components/ui';
import { TimerIcon, TrashIcon } from '@/components/icons';
import { WorklogDialog } from './WorklogDialog';

/** Worklogs listed in the dialog; the total always counts them all. */
const SHOWN = 5;

/** Estimated vs spent time, with the latest worklogs and «ثبت زمان». */
export function TimeTrackingPanel({ task }: { readonly task: Task }) {
  const { state, dispatch, currentUser } = useWorkspace();
  const [logging, setLogging] = useState(false);
  const close = useCallback(() => setLogging(false), []);
  const worklogs = state.taskWorklogs?.[task.id] ?? [];
  const spent = task.spentMinutes ?? 0;
  const estimate = task.estimatedMinutes ?? null;
  const over = estimate !== null && spent > estimate;

  return (
    <section aria-label="زمان‌سنجی وظیفه" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-title-sm font-semibold text-fg-primary">زمان‌سنجی</h3>
        <Button size="xs" variant="secondary" className="ms-auto" iconStart={<TimerIcon size={14} />} onClick={() => setLogging(true)}>
          ثبت زمان
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-secondary bg-sunken/40 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-caption">
          <span className="text-fg-secondary">
            صرف‌شده: <strong className="numeric font-semibold text-fg-primary">{formatDuration(spent)}</strong>
          </span>
          <span className="text-fg-tertiary">
            {estimate === null ? 'برآوردی ثبت نشده' : <>برآورد: <span className="numeric">{formatDuration(estimate)}</span></>}
          </span>
        </div>
        {estimate !== null && (
          <>
            <ProgressBar value={spent} max={estimate} label="زمان صرف‌شده نسبت به برآورد" tone={over ? 'blocked' : 'brand'} showFraction={false} />
            <span className={over ? 'numeric text-micro font-medium text-status-blocked' : 'numeric text-micro text-fg-tertiary'}>
              {over ? `${formatDuration(spent - estimate)} بیش از برآورد` : `${formatDuration(estimate - spent)} باقی‌مانده`}
            </span>
          </>
        )}
      </div>

      {worklogs.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="زمان‌های ثبت‌شده">
          {worklogs.slice(0, SHOWN).map((worklog) => {
            const author = userById(worklog.userId);
            return (
              <li key={worklog.id} className="flex items-center gap-2 rounded-lg border border-secondary bg-surface px-2 py-1.5">
                {author && <Avatar name={author.fullName} initials={author.initials} tone={author.avatarTone} size="xs" decorative />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-caption text-fg-primary">
                    <span className="numeric font-semibold">{formatDuration(worklog.minutes)}</span>
                    {author && <span className="text-fg-tertiary">{` · ${author.fullName}`}</span>}
                  </span>
                  {worklog.note && <span className="truncate text-micro text-fg-tertiary">{worklog.note}</span>}
                </span>
                <RelativeTime iso={worklog.loggedAt} className="shrink-0 text-micro text-fg-quaternary" />
                {worklog.userId === currentUser.id && (
                  <IconButton
                    label={`حذف زمان ${formatDuration(worklog.minutes)}`}
                    icon={<TrashIcon size={14} />}
                    size="xs"
                    onClick={() => dispatch({ type: 'remove-worklog', taskId: task.id, worklogId: worklog.id })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <WorklogDialog
        open={logging}
        taskTitle={task.title}
        onClose={close}
        onSubmit={(minutes, note) => {
          dispatch({ type: 'log-work', taskId: task.id, minutes, note });
          setLogging(false);
        }}
      />
    </section>
  );
}
