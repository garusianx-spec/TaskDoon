'use client';

import { useState } from 'react';
import type { Subtask } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { formatFraction } from '@/lib/format';
import { userById } from '@/store/selectors';
import { Avatar, Checkbox, IconButton, Input, ProgressBar } from '@/components/ui';
import { AddIcon, ArrowDownIcon, ArrowUpIcon, DragHandleIcon, TrashIcon } from '@/components/icons';

export interface SubtaskListProps {
  readonly subtasks: readonly Subtask[];
  readonly onToggle: (subtaskId: string) => void;
  readonly onAdd: (title: string) => void;
  readonly onRemove: (subtaskId: string) => void;
  readonly onMove: (subtaskId: string, delta: number) => void;
  readonly taskTitle: string;
}

/**
 * Reorderable checklist.
 *
 * The drag handle is a real button: pointer users drag it, keyboard users focus it and press
 * ArrowUp/ArrowDown (or the explicit move buttons revealed on focus) to reposition the row.
 * Every reorder path funnels through the same `onMove` callback.
 */
export function SubtaskList({ subtasks, onToggle, onAdd, onRemove, onMove, taskTitle }: SubtaskListProps) {
  const [draft, setDraft] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const done = subtasks.filter((subtask) => subtask.done).length;

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft('');
  };

  const moveByDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const from = subtasks.findIndex((subtask) => subtask.id === draggingId);
    const to = subtasks.findIndex((subtask) => subtask.id === targetId);
    if (from === -1 || to === -1) return;
    onMove(draggingId, to - from);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h4 className="text-title-sm font-semibold text-fg-primary">زیروظیفه‌ها</h4>
        <span className="numeric text-caption text-fg-tertiary">
          {subtasks.length > 0 ? formatFraction(done, subtasks.length) : '—'}
        </span>
        {subtasks.length > 0 && (
          <ProgressBar
            value={done}
            max={subtasks.length}
            label={`پیشرفت زیروظیفه‌های ${taskTitle}`}
            tone={done === subtasks.length ? 'done' : 'brand'}
            showFraction={false}
            className="flex-1"
          />
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {subtasks.map((subtask, index) => {
          const assignee = subtask.assigneeId ? userById(subtask.assigneeId) : undefined;

          return (
            <li
              key={subtask.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverId(subtask.id);
              }}
              onDragLeave={() => setDragOverId((current) => (current === subtask.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                moveByDrop(subtask.id);
                setDragOverId(null);
                setDraggingId(null);
              }}
              className={cn(
                'group/subtask relative flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1.5 transition-colors hover:bg-hover',
                dragOverId === subtask.id && 'border-brand bg-brand-subtle',
                draggingId === subtask.id && 'opacity-50',
              )}
            >
              <button
                type="button"
                draggable
                onDragStart={() => setDraggingId(subtask.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onMove(subtask.id, -1);
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onMove(subtask.id, 1);
                  }
                }}
                aria-label={`جابه‌جایی «${subtask.title}» — با کلیدهای بالا و پایین ترتیب را تغییر دهید`}
                className="cursor-grab text-fg-quaternary transition-colors hover:text-fg-secondary active:cursor-grabbing"
              >
                <DragHandleIcon size={16} />
              </button>

              <Checkbox
                checked={subtask.done}
                onCheckedChange={() => onToggle(subtask.id)}
                ariaLabel={subtask.title}
                size="sm"
              />

              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-body-sm',
                  subtask.done ? 'text-fg-tertiary line-through' : 'text-fg-primary',
                )}
              >
                {subtask.title}
              </span>

              {assignee && (
                <Avatar
                  name={assignee.fullName}
                  initials={assignee.initials}
                  tone={assignee.avatarTone}
                  size="xs"
                />
              )}

              {/* Overlaid rather than in-flow so the title keeps the full row width. */}
              <span className="absolute inset-y-0 end-1 flex items-center rounded-lg bg-hover px-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/subtask:opacity-100">
                <IconButton
                  label={`انتقال «${subtask.title}» به بالا`}
                  icon={<ArrowUpIcon size={14} />}
                  size="xs"
                  disabled={index === 0}
                  onClick={() => onMove(subtask.id, -1)}
                />
                <IconButton
                  label={`انتقال «${subtask.title}» به پایین`}
                  icon={<ArrowDownIcon size={14} />}
                  size="xs"
                  disabled={index === subtasks.length - 1}
                  onClick={() => onMove(subtask.id, 1)}
                />
                <IconButton
                  label={`حذف «${subtask.title}»`}
                  icon={<TrashIcon size={14} />}
                  size="xs"
                  onClick={() => onRemove(subtask.id)}
                  className="hover:text-status-blocked"
                />
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-end gap-2">
        <Input
          label="افزودن زیروظیفه"
          hideLabel
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="افزودن زیروظیفه…"
          containerClassName="flex-1"
          iconStart={<AddIcon size={16} />}
        />
        <IconButton
          label="افزودن زیروظیفه"
          icon={<AddIcon size={18} />}
          variant="secondary"
          onClick={submit}
          disabled={draft.trim().length === 0}
        />
      </div>
    </div>
  );
}
