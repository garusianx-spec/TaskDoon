import type { IssueSeverity, IssueType, Task, TaskDependencyType, TaskLink } from '@taskin/contracts';
import { codeMessage } from '@/api/messages';
import type { BadgeTone } from '@/components/ui';

/*
 * Agile tracking vocabulary and rules shared by the board, the task dialog and the demo store.
 * Every field is optional on `Task` (tasks from before it are plain board tasks), so read them
 * through these helpers rather than directly.
 */

export const ISSUE_TYPES: readonly { readonly id: IssueType; readonly label: string }[] = [
  { id: 'task', label: 'وظیفه' },
  { id: 'bug', label: 'باگ' },
  { id: 'feature', label: 'ویژگی' },
];

export const ISSUE_SEVERITIES: readonly { readonly id: IssueSeverity; readonly label: string; readonly tone: BadgeTone }[] = [
  { id: 'critical', label: 'بحرانی', tone: 'error' },
  { id: 'high', label: 'زیاد', tone: 'warning' },
  { id: 'medium', label: 'متوسط', tone: 'review' },
  { id: 'low', label: 'کم', tone: 'neutral' },
];

/** Relations as read from the task on hand. */
export const DEPENDENCY_KINDS: readonly { readonly id: TaskDependencyType; readonly label: string }[] = [
  { id: 'blocks', label: 'مسدود می‌کند' },
  { id: 'blocked_by', label: 'مسدود شده توسط' },
  { id: 'relates_to', label: 'مرتبط با' },
];

const INVERSE: Record<TaskDependencyType, TaskDependencyType> = { blocks: 'blocked_by', blocked_by: 'blocks', relates_to: 'relates_to' };

export const inverseKind = (kind: TaskDependencyType): TaskDependencyType => INVERSE[kind];

export const issueTypeOf = (task: Pick<Task, 'type'>): IssueType => task.type ?? 'task';

export const issueTypeLabel = (type: IssueType): string => ISSUE_TYPES.find((entry) => entry.id === type)?.label ?? 'وظیفه';

export const severityLabel = (severity: IssueSeverity): string => ISSUE_SEVERITIES.find((entry) => entry.id === severity)?.label ?? '';

export const severityTone = (severity: IssueSeverity): BadgeTone => ISSUE_SEVERITIES.find((entry) => entry.id === severity)?.tone ?? 'neutral';

export const dependencyKindLabel = (kind: TaskDependencyType): string => DEPENDENCY_KINDS.find((entry) => entry.id === kind)?.label ?? '';

export const isBacklog = (task: Pick<Task, 'isBacklog'>): boolean => task.isBacklog === true;

/**
 * The tasks blocking `task` that are not done yet. Statuses come from the tasks on hand, so a
 * blocker completed or reopened anywhere updates this at once; blockers not on hand (archived)
 * no longer block.
 */
export function openBlockers(task: Pick<Task, 'blockedByIds'>, tasks: readonly Task[]): Task[] {
  const ids = task.blockedByIds ?? [];
  if (ids.length === 0) return [];
  return tasks.filter((entry) => ids.includes(entry.id) && entry.status !== 'done');
}

/**
 * Whether making `blockerId` block `blockedId` would close a loop: `blockedId` already blocks
 * `blockerId`, directly or through other tasks (the API refuses it with DEPENDENCY_CYCLE).
 */
export function wouldCreateCycle(tasks: readonly Task[], blockerId: string, blockedId: string): boolean {
  if (blockerId === blockedId) return true;
  const blocks = new Map<string, string[]>();
  for (const task of tasks) {
    for (const blocker of task.blockedByIds ?? []) blocks.set(blocker, [...(blocks.get(blocker) ?? []), task.id]);
  }
  const seen = new Set<string>([blockedId]);
  const queue = [blockedId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of blocks.get(current) ?? []) {
      if (next === blockerId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** Why `task` cannot be linked to `other` as `kind`, or `null` when it can. */
export function linkProblem(tasks: readonly Task[], links: readonly TaskLink[], task: Task, other: Task, kind: TaskDependencyType): string | null {
  if (task.id === other.id) return 'یک وظیفه نمی‌تواند به خودش وابسته باشد.';
  if (task.projectId !== other.projectId) return codeMessage('DEPENDENCY_CROSS_PROJECT');
  const linked =
    links.some((link) => link.taskId === other.id) || (task.blockedByIds ?? []).includes(other.id) || (other.blockedByIds ?? []).includes(task.id);
  if (linked) return codeMessage('DEPENDENCY_EXISTS');
  if (kind !== 'relates_to') {
    const [blocker, blocked] = kind === 'blocks' ? [task.id, other.id] : [other.id, task.id];
    if (wouldCreateCycle(tasks, blocker, blocked)) return codeMessage('DEPENDENCY_CYCLE');
  }
  return null;
}
