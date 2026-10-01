'use client';

import type { IssueSeverity, IssueType } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { issueTypeLabel, severityLabel } from '@/lib/agile';
import { BugIcon, FeatureIcon, TaskSquareIcon } from '@/components/icons';

export interface IssueTypeIconProps {
  readonly type: IssueType;
  readonly severity?: IssueSeverity | null;
  readonly size?: number;
  /** Plain tasks draw nothing unless asked: boards and lists only mark bugs and features. */
  readonly showTask?: boolean;
  /** Next to a visible label (menu options): hidden from assistive tech. */
  readonly decorative?: boolean;
  readonly className?: string;
}

/** The small glyph that tells a bug or a feature apart from a plain task. */
export function IssueTypeIcon({ type, severity = null, size = 14, showTask = false, decorative = false, className }: IssueTypeIconProps) {
  const named = type === 'bug' && severity ? `${issueTypeLabel(type)} (شدت ${severityLabel(severity)})` : issueTypeLabel(type);
  const label = decorative ? undefined : named;
  if (type === 'bug') return <BugIcon size={size} label={label} className={cn('shrink-0 text-status-blocked', className)} />;
  if (type === 'feature') return <FeatureIcon size={size} label={label} className={cn('shrink-0 text-fg-brand', className)} />;
  return showTask ? <TaskSquareIcon size={size} label={label} className={cn('shrink-0 text-fg-tertiary', className)} /> : null;
}
