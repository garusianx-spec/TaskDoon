'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ActivityKind, Task } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { deadlinePeriod, subtaskProgress, tasksAssignedTo, userById } from '@/store/selectors';
import { describeDeadline, formatJalali, parseISODate, toISODate, toPersianDigits } from '@taskin/jalali';
import { formatCount, formatPercent } from '@/lib/format';
import { statusLabel, statusTone } from '@/data/reference';
import { cn } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { TaskCompleteCheckbox, completedTitleClass } from '@/features/tasks/components/TaskCompleteCheckbox';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { useNow } from '@/hooks/useNow';
import { workspaceRoutes } from '@/lib/workspace-navigation';
import { Avatar, Badge, Button, ProgressBar, RelativeTime } from '@/components/ui';
import {
  AddIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  MessagesIcon,
  TaskSquareIcon,
  UserAddIcon,
  WarningIcon,
} from '@/components/icons';
import { TodayLabel, SummaryCard } from '@/features/workspace/components/feed/FeedSummary';

const ACTIVITY_ICONS: Readonly<Record<ActivityKind, typeof TaskSquareIcon>> = {
  'task-assigned': TaskSquareIcon,
  'task-completed': CheckCircleIcon,
  'task-commented': MessagesIcon,
  'message-mention': MessagesIcon,
  'file-shared': DocumentIcon,
  'member-joined': UserAddIcon,
};

const ACTIVITY_VERBS: Readonly<Record<ActivityKind, string>> = {
  'task-assigned': 'وظیفه‌ای را به شما ارجاع داد',
  'task-completed': 'وظیفه‌ای را انجام‌شده علامت زد',
  'task-commented': 'روی وظیفه‌ای دیدگاه گذاشت',
  'message-mention': 'در گفتگویی به شما اشاره کرد',
  'file-shared': 'فایلی را به اشتراک گذاشت',
  'member-joined': 'به فضای کاری پیوست',
};

export function FeedPage() {
  return (
    <AppShell>
      <FeedContent />
    </AppShell>
  );
}

function FeedContent() {
  const { state, dispatch, currentUser, totalUnread, activeWorkspace } = useWorkspace();
  const { openTaskComposer } = useOverlays();

  const now = useNow();
  const today = now ? toISODate(now, activeWorkspace.timeZone) : null;
  const clockTime = now
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: activeWorkspace.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now)
    : '';
  const nextEvent = today
    ? state.calendarEvents
        .filter(
          (event) =>
            event.date > today ||
            (event.date === today && (!event.startTime || event.startTime >= clockTime)),
        )
        .sort(
          (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''),
        )[0]
    : undefined;
  const myTasks = tasksAssignedTo(state.tasks, currentUser.id);
  const openTasks = myTasks.filter((task) => task.status !== 'done');
  // Tasks ticked off here stay listed (struck through) for the rest of the visit, so a slip
  // of the finger can be undone in place instead of hunting for the task on the board.
  const [completedHere, setCompletedHere] = useState<readonly string[]>([]);
  const actionable = myTasks.filter((task) => task.status !== 'done' || completedHere.includes(task.id));
  const deadlines: Record<ReturnType<typeof deadlinePeriod>, Task[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    undated: [],
  };
  for (const task of actionable)
    deadlines[today ? deadlinePeriod(task.dueDate, today) : 'undated'].push(task);
  const groups = [
    { label: 'دارای تأخیر', tasks: deadlines.overdue },
    { label: 'سررسید امروز', tasks: deadlines.today },
    { label: 'سررسیدهای پیش رو', tasks: deadlines.upcoming },
    { label: 'بدون مهلت', tasks: deadlines.undated },
  ];
  const projectNames = new Map(state.projects.map((project) => [project.id, project.name]));
  const completionRate =
    myTasks.length === 0 ? 0 : ((myTasks.length - openTasks.length) / myTasks.length) * 100;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-secondary bg-surface px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-1">
          <h1 className="text-heading-sm font-bold text-fg-primary">امروز</h1>
          <h2 className="text-title-sm font-semibold text-fg-secondary">
            {`سلام ${currentUser.fullName.split(' ')[0]}، روز خوبی داشته باشی`}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <TodayLabel date={today} />
            <Link
              href="/calendar"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-body-sm font-semibold text-fg-brand hover:underline"
            >
              <CalendarIcon size={17} />
              مشاهدهٔ تقویم
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
        <section aria-label="وظایف نیازمند اقدام" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title font-bold text-fg-primary">نیازمند اقدام شما</h2>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<AddIcon size={16} />}
              className="ms-auto min-h-11"
              onClick={() => openTaskComposer(null)}
            >
              وظیفه جدید
            </Button>
          </div>

          {actionable.length === 0 ? (
            <p className="rounded-xl border border-dashed border-primary px-4 py-6 text-center text-body-sm text-fg-tertiary">
              وظیفه بازی به شما ارجاع نشده است.
            </p>
          ) : (
            groups.map(
              ({ label, tasks }) =>
                tasks.length > 0 && (
                  <section key={label} aria-label={label} className="flex flex-col gap-1.5">
                    <h3 className="px-1 text-caption font-semibold text-fg-secondary">{label}</h3>
                    <ul className="flex flex-col gap-2">
                      {[...tasks]
                        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
                        .slice(0, 3)
                        .map((task) => {
                          const done = task.status === 'done';
                          const progress = subtaskProgress(task);
                          const deadline = today
                            ? describeDeadline(task.dueDate, parseISODate(today), done)
                            : {
                                tone: 'todo' as const,
                                text: task.dueDate ? formatJalali(task.dueDate, 'day-month') : 'بدون مهلت',
                              };
                          return (
                            <li
                              key={task.id}
                              className="flex items-center gap-3 rounded-xl border border-secondary bg-surface ps-3 shadow-xs transition-colors hover:border-brand"
                            >
                              <TaskCompleteCheckbox
                                task={task}
                                onToggle={(completed) => {
                                  dispatch({ type: 'set-task-completed', taskId: task.id, completed });
                                  setCompletedHere((current) =>
                                    completed
                                      ? [...current, task.id]
                                      : current.filter((id) => id !== task.id),
                                  );
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => dispatch({ type: 'open-task', taskId: task.id })}
                                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pe-3 text-start"
                              >
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                  <span
                                    className={cn(
                                      'truncate text-body-sm font-semibold transition-[color,opacity]',
                                      done ? completedTitleClass : 'text-fg-primary',
                                    )}
                                  >
                                    {task.title}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-x-2 text-micro text-fg-tertiary">
                                    <span className="numeric latin-inline">{task.code}</span>
                                    <span className="min-w-0 break-words">
                                      {projectNames.get(task.projectId)}
                                    </span>
                                  </span>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <Badge tone={statusTone(task.status)} size="sm" dot>
                                      {statusLabel(task.status)}
                                    </Badge>
                                    <Badge tone={deadline.tone} size="sm" numeric>
                                      {deadline.text}
                                    </Badge>
                                    {progress.total > 0 && (
                                      <ProgressBar
                                        value={progress.done}
                                        max={progress.total}
                                        label={`پیشرفت ${task.title}`}
                                        className="max-w-28"
                                      />
                                    )}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                  </section>
                ),
            )
          )}
          {groups.some(({ tasks }) => tasks.length > 3) && (
            <Link
              href={workspaceRoutes.myTasks}
              className="inline-flex min-h-11 w-fit items-center rounded-lg px-1 text-body-sm font-semibold text-fg-brand hover:underline"
            >
              همهٔ کارهای من
            </Link>
          )}
        </section>

        <section
          aria-labelledby="next-calendar-event"
          className="flex flex-col gap-2 rounded-xl border border-secondary bg-surface p-4 shadow-xs"
        >
          <h2 id="next-calendar-event" className="text-title font-bold text-fg-primary">
            رویداد بعدی
          </h2>
          {nextEvent ? (
            <div className="min-w-0">
              <p className="break-words text-body-sm font-semibold text-fg-primary">{nextEvent.title}</p>
              <p className="text-caption text-fg-secondary numeric">
                {formatJalali(nextEvent.date, 'medium')}
                {nextEvent.startTime && `، ساعت ${toPersianDigits(nextEvent.startTime)}`}
              </p>
            </div>
          ) : (
            <p className="text-caption text-fg-secondary">رویداد آینده‌ای در تقویم فعلی نیست.</p>
          )}
        </section>

        <section aria-label="خلاصه وضعیت" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label="وظایف باز من"
            value={formatCount(openTasks.length)}
            tone="brand"
            Icon={TaskSquareIcon}
          />
          <SummaryCard
            label="سررسید امروز"
            value={formatCount(deadlines.today.filter((task) => task.status !== 'done').length)}
            tone="progress"
            Icon={ClockIcon}
          />
          <SummaryCard
            label="دارای تأخیر"
            value={formatCount(deadlines.overdue.filter((task) => task.status !== 'done').length)}
            tone="blocked"
            Icon={WarningIcon}
          />
          <SummaryCard
            label="پیام خوانده‌نشده"
            value={formatCount(totalUnread)}
            tone="review"
            Icon={MessagesIcon}
          />
        </section>

        <section
          aria-label="پیشرفت کلی"
          className="rounded-xl border border-secondary bg-surface p-4 shadow-xs"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-title font-bold text-fg-primary">پیشرفت وظایف من</h2>
            <Badge tone="brand" size="md" numeric className="ms-auto">
              {formatPercent(completionRate)}
            </Badge>
          </div>
          <ProgressBar
            value={myTasks.length - openTasks.length}
            max={Math.max(myTasks.length, 1)}
            label="درصد وظایف انجام‌شده"
            tone={completionRate >= 70 ? 'done' : 'brand'}
            showFraction={false}
          />
          <p className="mt-2 text-caption text-fg-tertiary numeric">
            {`${formatCount(myTasks.length - openTasks.length)} از ${formatCount(myTasks.length)} وظیفه انجام شده است.`}
          </p>
        </section>

        <section aria-label="فعالیت‌های اخیر" className="flex flex-col gap-3">
          <h2 className="text-title font-bold text-fg-primary">فعالیت‌های اخیر سازمان</h2>
          {state.activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-secondary px-4 py-6 text-center text-body-sm text-fg-tertiary">
              هنوز فعالیتی در این فضای کاری ثبت نشده است.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {state.activity.map((item) => {
                const actor = userById(item.actorId);
                const Icon = ACTIVITY_ICONS[item.kind];
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover"
                  >
                    {actor && (
                      <Avatar
                        name={actor.fullName}
                        initials={actor.initials}
                        tone={actor.avatarTone}
                        size="sm"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-body-sm text-fg-secondary">
                        <span className="font-semibold text-fg-primary">{actor?.fullName ?? 'کاربر'}</span>
                        {` ${ACTIVITY_VERBS[item.kind]}`}
                      </p>
                      <p className="truncate text-caption font-medium text-fg-primary">{item.targetTitle}</p>
                      <p className="truncate text-micro text-fg-tertiary numeric">
                        {`${item.context}، `}
                        <RelativeTime iso={item.createdAt} />
                      </p>
                    </div>
                    <Icon size={18} className="mt-1 shrink-0 text-fg-quaternary" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
