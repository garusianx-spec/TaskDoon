'use client';

import { useEffect, useState } from 'react';
import type { IssueSeverity, IssueType, Task } from '@taskin/contracts';
import { ISSUE_SEVERITIES, ISSUE_TYPES, isBacklog, issueTypeOf } from '@/lib/agile';
import { formatDuration, MAX_ESTIMATE_MINUTES, parseDuration } from '@/lib/duration';
import type { TaskPatch } from '@/store/workspace-reducer';
import { Button, Input, Select } from '@/components/ui';
import { BacklogIcon, KanbanIcon } from '@/components/icons';
import { IssueTypeIcon } from './IssueTypeIcon';

type SelectSize = 'sm' | 'md';

/** «نوع»: task, bug or feature. */
export function IssueTypeSelect({
  value,
  onChange,
  label,
  hideLabel = true,
  size = 'sm',
}: {
  readonly value: IssueType;
  readonly onChange: (type: IssueType) => void;
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly size?: SelectSize;
}) {
  return (
    <Select
      label={label}
      hideLabel={hideLabel}
      size={size}
      value={value}
      onValueChange={onChange}
      options={ISSUE_TYPES.map((entry) => ({ value: entry.id, label: entry.label, icon: <IssueTypeIcon type={entry.id} showTask decorative size={15} /> }))}
    />
  );
}

/** «شدت» of a bug; «تعیین نشده» clears it. */
export function SeveritySelect({
  value,
  onChange,
  label,
  hideLabel = true,
  size = 'sm',
}: {
  readonly value: IssueSeverity | null;
  readonly onChange: (severity: IssueSeverity | null) => void;
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly size?: SelectSize;
}) {
  return (
    <Select
      label={label}
      hideLabel={hideLabel}
      size={size}
      value={value ?? 'none'}
      onValueChange={(next) => onChange(next === 'none' ? null : next)}
      options={[{ value: 'none' as const, label: 'تعیین نشده' }, ...ISSUE_SEVERITIES.map((entry) => ({ value: entry.id, label: entry.label }))]}
    />
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-fg-tertiary">{label}</span>
      {children}
    </div>
  );
}

/**
 * The task dialog's agile properties: type, a bug's severity, the estimate, and whether the task
 * sits on the board or in the backlog.
 */
export function IssueFields({ task, onPatch }: { readonly task: Task; readonly onPatch: (patch: TaskPatch) => void }) {
  const type = issueTypeOf(task);
  const inBacklog = isBacklog(task);
  return (
    <>
      <Field label="نوع">
        <IssueTypeSelect label="نوع وظیفه" value={type} onChange={(next) => onPatch({ type: next })} />
      </Field>
      {type === 'bug' && (
        <Field label="شدت">
          <SeveritySelect label="شدت باگ" value={task.severity ?? null} onChange={(severity) => onPatch({ severity })} />
        </Field>
      )}
      <Field label="برآورد زمان">
        <EstimateInput value={task.estimatedMinutes ?? null} onCommit={(estimatedMinutes) => onPatch({ estimatedMinutes })} />
      </Field>
      <Field label="جایگاه">
        <Button
          size="sm"
          variant="secondary"
          iconStart={inBacklog ? <KanbanIcon size={16} /> : <BacklogIcon size={16} />}
          onClick={() => onPatch({ isBacklog: !inBacklog })}
        >
          {inBacklog ? 'انتقال به بورد' : 'انتقال به بک‌لاگ'}
        </Button>
      </Field>
    </>
  );
}

/** The estimate as typed («2h», «۱ ساعت و ۳۰ دقیقه», «90»), saved on blur or Enter; empty clears it. */
function EstimateInput({ value, onCommit }: { readonly value: number | null; readonly onCommit: (minutes: number | null) => void }) {
  const shown = value === null ? '' : formatDuration(value);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    setText(shown);
    setError(undefined);
  }, [shown]);

  const commit = () => {
    if (text.trim() === '') {
      if (value !== null) onCommit(null);
      return;
    }
    if (text === shown) return;
    const minutes = parseDuration(text);
    if (minutes === null || minutes > MAX_ESTIMATE_MINUTES) {
      setError('مثلاً «۲ ساعت»، «1h 30m» یا «۹۰» (دقیقه) بنویسید.');
      return;
    }
    setError(undefined);
    if (minutes !== value) onCommit(minutes);
    else setText(shown);
  };

  return (
    <Input
      label="برآورد زمان وظیفه"
      hideLabel
      value={text}
      placeholder="مثلاً 2h یا ۹۰ دقیقه"
      error={error}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
