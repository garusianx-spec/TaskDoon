'use client';

import { useRef, useState } from 'react';
import type { BoardColumn, Task, TaskPriority, User } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { formatJalali } from '@taskin/jalali';
import { downloadAttachment } from '@/lib/download';
import { formatCount, formatFileSize } from '@/lib/format';
import { TASK_PRIORITIES, statusTone } from '@/data/reference';
import { directory } from '@/store/directory';
import { columnForTask, projectById, userById } from '@/store/selectors';
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Popover,
  RelativeTime,
  Select,
  Textarea,
  Tooltip,
} from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { SubtaskList } from './SubtaskList';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ColumnDot } from './ColumnDot';
import { DependencyManager } from './agile/DependencyManager';
import { IssueFields } from './agile/IssueFields';
import { TimeTrackingPanel } from './agile/TimeTrackingPanel';
import type { TaskPatch } from '@/store/workspace-reducer';
import {
  CloseIcon,
  DownloadIcon,
  FlagIcon,
  MessagesIcon,
  PaperclipIcon,
  SendIcon,
  StarFilledIcon,
  StarIcon,
  TrashIcon,
  UserAddIcon,
  ATTACHMENT_ICONS,
} from '@/components/icons';


export interface TaskInspectorProps {
  readonly task: Task;
  readonly currentUser: User;
  /** Board columns, custom ones included — the status picker moves the card between them. */
  readonly columns: readonly BoardColumn[];
  readonly onClose: () => void;
  readonly onPatch: (patch: TaskPatch) => void;
  readonly onMoveToColumn: (columnId: string) => void;
  readonly onToggleStar: () => void;
  readonly onToggleSubtask: (subtaskId: string) => void;
  readonly onAddSubtask: (title: string) => void;
  readonly onRemoveSubtask: (subtaskId: string) => void;
  readonly onMoveSubtask: (subtaskId: string, delta: number) => void;
  readonly onAddComment: (body: string, replyToId: string | null) => void;
  readonly onAttachFiles?: (files: readonly File[]) => void;
  readonly onRemoveAttachment?: (attachmentId: string) => void;
  /** The chat message the task came from, when it did. */
  readonly source?: TaskSourceView | null;
  /** Opens the source message in its conversation, highlighted. */
  readonly onOpenSource?: () => void;
}

export interface TaskSourceView {
  /** `false` for people outside the message's conversation: they only learn that there is one. */
  readonly accessible: boolean;
  readonly excerpt: string | null;
  readonly authorName: string | null;
  readonly conversationTitle: string | null;
  readonly deleted: boolean;
}

/**
 * Full task inspector: status, people, Jalali dates, checklist, file repository and an
 * internal discussion thread kept separate from the chat module.
 */
export function TaskInspector({
  task,
  currentUser,
  columns,
  onClose,
  onPatch,
  onMoveToColumn,
  onToggleStar,
  onToggleSubtask,
  onAddSubtask,
  onRemoveSubtask,
  onMoveSubtask,
  onAddComment,
  onAttachFiles,
  onRemoveAttachment,
  source = null,
  onOpenSource,
}: TaskInspectorProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [comment, setComment] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const project = projectById(task.projectId);
  const column = columnForTask(columns, task);
  const reviewer = task.reviewerId ? userById(task.reviewerId) : undefined;

  const submitComment = () => {
    const body = comment.trim();
    if (!body) return;
    onAddComment(body, replyToId);
    setComment('');
    setReplyToId(null);
  };

  return (
    <>
      {/* Stays in view while the dialog scrolls, so closing is always one click away. */}
      <header className="sticky top-0 z-10 flex shrink-0 items-start gap-2 border-b border-secondary bg-surface p-4 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(task.status)} size="sm" dot>
              {column?.title ?? task.status}
            </Badge>
            <span className="numeric latin-inline text-micro font-medium text-fg-quaternary">{task.code}</span>
          </div>
          <h2 className="text-title font-bold leading-7 text-fg-primary">{task.title}</h2>
          {project && <p className="truncate text-caption text-fg-tertiary">{project.name}</p>}
        </div>

        <Tooltip content={task.starred ? 'حذف از ستاره‌دارها' : 'افزودن به ستاره‌دارها'}>
          <IconButton
            label={task.starred ? 'حذف از ستاره‌دارها' : 'افزودن به ستاره‌دارها'}
            icon={task.starred ? <StarFilledIcon size={18} /> : <StarIcon size={18} />}
            size="sm"
            onClick={onToggleStar}
            className={task.starred ? 'text-status-progress' : undefined}
          />
        </Tooltip>
        <IconButton label="بستن پنل جزئیات" icon={<CloseIcon size={20} />} size="sm" onClick={onClose} />
      </header>

      {/*
        From `md` the dialog is wide enough for two columns: the work itself (description,
        checklist, source, files, discussion) at the start, the properties beside it.
      */}
      <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start">
        <section
          className="flex flex-col gap-3 md:col-start-2 md:row-start-1 md:rounded-xl md:border md:border-secondary md:bg-sunken/40 md:p-4"
          aria-label="ویژگی‌های وظیفه"
        >
          <Field label="وضعیت">
            <Select
              label="وضعیت وظیفه"
              size="sm"
              value={column?.id ?? task.status}
              onValueChange={onMoveToColumn}
              options={columns.map((entry) => ({
                value: entry.id,
                label: entry.title,
                icon: <ColumnDot column={entry} />,
                ...(entry.custom ? { description: 'ستون سفارشی' } : {}),
              }))}
            />
          </Field>

          <Field label="اولویت">
            <Select
              label="اولویت وظیفه"
              size="sm"
              value={task.priority}
              onValueChange={(priority: TaskPriority) => onPatch({ priority })}
              options={TASK_PRIORITIES.map((entry) => ({
                value: entry.id,
                label: entry.label,
                icon: <FlagIcon size={15} />,
              }))}
            />
          </Field>

          <IssueFields task={task} onPatch={onPatch} />

          <Field label="مسئولان">
            <PeoplePicker
              selectedIds={task.assigneeIds}
              onToggle={(userId) =>
                onPatch({
                  assigneeIds: task.assigneeIds.includes(userId)
                    ? task.assigneeIds.filter((id) => id !== userId)
                    : [...task.assigneeIds, userId],
                })
              }
              label="انتخاب مسئولان وظیفه"
              emptyLabel="افزودن مسئول"
            />
          </Field>

          <Field label="تاییدکننده">
            <PeoplePicker
              selectedIds={reviewer ? [reviewer.id] : []}
              onToggle={(userId) =>
                onPatch({ reviewerId: task.reviewerId === userId ? null : userId })
              }
              label="انتخاب تاییدکننده"
              emptyLabel="افزودن تاییدکننده"
              single
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            <Field label="تاریخ شروع">
              <JalaliDatePicker
                label="انتخاب تاریخ شروع"
                value={task.startDate}
                onChange={(startDate) => onPatch({ startDate })}
              />
            </Field>
            <Field label="مهلت انجام">
              <JalaliDatePicker
                label="انتخاب مهلت انجام"
                value={task.dueDate}
                onChange={(dueDate) => onPatch({ dueDate })}
              />
            </Field>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6 md:col-start-1 md:row-start-1">
          <section aria-label="توضیحات وظیفه">
            <h3 className="mb-2 text-title-sm font-semibold text-fg-primary">توضیحات</h3>
            <Textarea
              label="توضیحات وظیفه"
              hideLabel
              defaultValue={task.description}
              onBlur={(event) => onPatch({ description: event.target.value })}
              className="min-h-24 text-body-sm"
              placeholder="شرح وظیفه را بنویسید…"
            />
          </section>
  
          <section aria-label="زیروظیفه‌ها">
            <SubtaskList
              subtasks={task.subtasks}
              taskTitle={task.title}
              onToggle={onToggleSubtask}
              onAdd={onAddSubtask}
              onRemove={onRemoveSubtask}
              onMove={onMoveSubtask}
            />
          </section>

          <TimeTrackingPanel task={task} />

          <DependencyManager task={task} />
  
          {source && (
            <section aria-labelledby="task-source-title" className="flex flex-col gap-2 rounded-xl border border-secondary bg-sunken p-3">
              <div className="flex items-center gap-2">
                <MessagesIcon size={16} className="text-fg-tertiary" />
                <h3 id="task-source-title" className="text-title-sm font-semibold text-fg-primary">
                  پیام مبدأ
                </h3>
                {source.accessible && source.conversationTitle && (
                  <span className="truncate text-caption text-fg-tertiary">{`در ${source.conversationTitle}`}</span>
                )}
              </div>
              {!source.accessible ? (
                <p className="text-caption text-fg-tertiary">این وظیفه از پیامی در گفتگویی ساخته شده که شما عضو آن نیستید.</p>
              ) : source.deleted ? (
                <p className="text-caption text-fg-tertiary">پیام مبدأ حذف شده است.</p>
              ) : (
                <>
                  <p className="line-clamp-3 text-body-sm leading-6 text-fg-secondary">
                    {source.authorName && <strong className="font-semibold text-fg-primary">{`${source.authorName}: `}</strong>}
                    {source.excerpt ?? 'فایل یا پیام صوتی'}
                  </p>
                  {onOpenSource && (
                    <Button size="xs" variant="secondary" className="self-start" iconStart={<MessagesIcon size={14} />} onClick={onOpenSource}>
                      نمایش پیام در گفتگو
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
  
          <section aria-label="مخزن فایل وظیفه">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-title-sm font-semibold text-fg-primary">فایل‌ها</h3>
              <span className="numeric text-caption text-fg-tertiary">
                {formatCount(task.attachments.length)}
              </span>
              <Button
                size="xs"
                variant="secondary"
                className="ms-auto"
                iconStart={<PaperclipIcon size={14} />}
                onClick={() => fileRef.current?.click()}
                disabled={!onAttachFiles}
              >
                پیوست فایل
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-label="انتخاب فایل برای پیوست به وظیفه"
                data-testid="task-file-input"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])].filter((file) => file.size > 0);
                  event.target.value = '';
                  if (files.length > 0) onAttachFiles?.(files);
                }}
              />
            </div>
  
            {task.attachments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-primary px-3 py-4 text-center text-caption text-fg-tertiary">
                هنوز فایلی به این وظیفه پیوست نشده است.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {task.attachments.map((attachment) => {
                  const Icon = ATTACHMENT_ICONS[attachment.kind];
                  const uploader = userById(attachment.uploadedById);
                  return (
                    <li
                      key={attachment.id}
                      className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
                        <Icon size={18} variant="twotone" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-caption font-semibold text-fg-primary">
                          {attachment.name}
                        </span>
                        <span className="numeric truncate text-micro text-fg-tertiary">
                          {`${formatFileSize(attachment.size)}، ${uploader?.fullName ?? ''}، ${formatJalali(attachment.uploadedAt, 'day-month')}`}
                        </span>
                      </span>
                      <IconButton
                        label={`دانلود ${attachment.name}`}
                        icon={<DownloadIcon size={16} />}
                        size="xs"
                        onClick={() => void downloadAttachment(attachment)}
                      />
                      <IconButton
                        label={`حذف ${attachment.name}`}
                        icon={<TrashIcon size={16} />}
                        size="xs"
                        className="hover:text-status-blocked"
                        onClick={() => onRemoveAttachment?.(attachment.id)}
                        disabled={!onRemoveAttachment}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
  
          <section aria-label="گفتگوی داخلی وظیفه">
            <div className="mb-2 flex items-center gap-2">
              <MessagesIcon size={16} className="text-fg-tertiary" />
              <h3 className="text-title-sm font-semibold text-fg-primary">گفتگوی داخلی</h3>
              <span className="numeric text-caption text-fg-tertiary">
                {formatCount(task.comments.length)}
              </span>
            </div>
            <p className="mb-3 text-micro text-fg-tertiary">
              این گفتگو مستقل از کانال‌های سازمان است و فقط برای اعضای این وظیفه نمایش داده می‌شود.
            </p>
  
            <ul className="flex flex-col gap-3">
              {task.comments.map((entry) => {
                const author = userById(entry.authorId);
                const parent = entry.replyToId
                  ? task.comments.find((candidate) => candidate.id === entry.replyToId)
                  : undefined;
                const parentAuthor = parent ? userById(parent.authorId) : undefined;
  
                return (
                  <li key={entry.id} className={cn('flex gap-2.5', parent && 'ps-6')}>
                    {author && (
                      <Avatar
                        name={author.fullName}
                        initials={author.initials}
                        tone={author.avatarTone}
                        size="sm"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-caption font-semibold text-fg-primary">
                          {author?.fullName ?? 'کاربر'}
                        </span>
                        <RelativeTime
                          iso={entry.createdAt}
                          className="numeric text-micro text-fg-quaternary"
                        />
                      </div>
                      {parentAuthor && (
                        <p className="border-s-2 border-brand-300 ps-2 text-micro text-fg-tertiary">
                          {`در پاسخ به ${parentAuthor.fullName}`}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap rounded-lg rounded-ss-sm bg-sunken px-3 py-2 text-body-sm leading-6 text-fg-secondary">
                        {entry.body}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReplyToId(entry.id)}
                        className="self-start text-micro font-semibold text-fg-brand hover:underline"
                      >
                        پاسخ
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
  
            <div className="mt-3 flex flex-col gap-2">
              {replyToId && (
                <div className="flex items-center gap-2 rounded-lg border-s-2 border-brand bg-sunken px-2.5 py-1.5">
                  <span className="flex-1 text-micro text-fg-tertiary">در حال پاسخ به یک دیدگاه</span>
                  <IconButton
                    label="لغو پاسخ"
                    icon={<CloseIcon size={14} />}
                    size="xs"
                    onClick={() => setReplyToId(null)}
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <Avatar
                  name={currentUser.fullName}
                  initials={currentUser.initials}
                  tone={currentUser.avatarTone}
                  size="sm"
                  decorative
                />
                <Textarea
                  label="نوشتن دیدگاه"
                  hideLabel
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder="دیدگاه خود را بنویسید…  (Ctrl + Enter برای ارسال)"
                  className="min-h-10 text-body-sm"
                  containerClassName="flex-1"
                />
                <IconButton
                  label="ارسال دیدگاه"
                  icon={<SendIcon size={18} />}
                  variant="primary"
                  onClick={submitComment}
                  disabled={comment.trim().length === 0}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
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

interface PeoplePickerProps {
  readonly selectedIds: readonly string[];
  readonly onToggle: (userId: string) => void;
  readonly label: string;
  readonly emptyLabel: string;
  readonly single?: boolean;
}

function PeoplePicker({ selectedIds, onToggle, label, emptyLabel, single = false }: PeoplePickerProps) {
  const selected = selectedIds
    .map((id) => userById(id))
    .filter((user): user is User => user !== undefined);

  return (
    <Popover
      label={label}
      haspopup="menu"
      align="start"
      panelClassName="min-w-64 max-h-72 overflow-y-auto scrollbar-thin"
      trigger={
        <button
          type="button"
          className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-primary bg-surface px-2.5 py-1.5 text-start shadow-xs transition-colors hover:bg-hover"
        >
          {selected.length === 0 ? (
            <span className="flex items-center gap-2 text-body-sm text-fg-placeholder">
              <UserAddIcon size={18} />
              {emptyLabel}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-0.5 pe-2 ps-0.5"
                >
                  <Avatar
                    name={user.fullName}
                    initials={user.initials}
                    tone={user.avatarTone}
                    size="xs"
                    decorative
                  />
                  <span className="text-micro font-medium text-fg-secondary">{user.fullName}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <MenuList>
          {directory.users().map((user) => (
            <MenuItem
              key={user.id}
              selected={selectedIds.includes(user.id)}
              onSelect={() => {
                onToggle(user.id);
                if (single) close();
              }}
              icon={
                <Avatar
                  name={user.fullName}
                  initials={user.initials}
                  tone={user.avatarTone}
                  size="sm"
                  decorative
                />
              }
            >
              <span className="flex flex-col">
                <span className="truncate">{user.fullName}</span>
                <span className="truncate text-micro font-normal text-fg-tertiary">{user.jobTitle}</span>
              </span>
            </MenuItem>
          ))}
        </MenuList>
      )}
    </Popover>
  );
}
