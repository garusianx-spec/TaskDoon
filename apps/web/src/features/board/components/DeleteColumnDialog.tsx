'use client';

import { useState } from 'react';
import type { BoardColumn } from '@taskin/contracts';
import type { ColumnDisposition } from '@/store/workspace-reducer';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { useNamespacedId } from '@/hooks/useId';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button, Modal, Select } from '@/components/ui';
import { ColumnDot } from '@/features/board/components/ColumnDot';
import { ArchiveIcon, TaskSquareIcon, TrashIcon } from '@/components/icons';

interface DeleteColumnDialogProps {
  readonly column: BoardColumn | null;
  readonly columns: readonly BoardColumn[];
  /** Cards in the column across the whole workspace, not only the filtered view. */
  readonly load: number;
  readonly onClose: () => void;
  readonly onConfirm: (disposition: ColumnDisposition) => void;
}

/** Confirms deleting a column that still holds cards: migrate them elsewhere, or archive them. */
export function DeleteColumnDialog({ column, columns, load, onClose, onConfirm }: DeleteColumnDialogProps) {
  const others = columns.filter((entry) => entry.id !== column?.id);
  const [choice, setChoice] = useState<'migrate' | 'archive'>('migrate');
  const [targetId, setTargetId] = useState('');
  const id = useNamespacedId('delete-column-');

  useResetOnOpen(
    column !== null,
    () => {
      if (!column) return;
      setChoice('migrate');
      // Default to a column that keeps the cards' status (a custom column's cards are in
      // progress), so migrating never silently completes or reopens work; else a neighbour.
      const index = columns.findIndex((entry) => entry.id === column.id);
      const sameStatus = columns.find((entry) => entry.id !== column.id && entry.status === column.status);
      setTargetId((sameStatus ?? columns[index - 1] ?? columns[index + 1])?.id ?? '');
    },
    column,
  );

  const options = [
    {
      value: 'migrate' as const,
      title: 'انتقال به ستون دیگر',
      description: 'کارت‌ها با همان وضعیت ستون مقصد ادامه پیدا می‌کنند.',
      Icon: TaskSquareIcon,
    },
    {
      value: 'archive' as const,
      title: 'بایگانی وظایف',
      description: 'کارت‌ها از بورد، فهرست و گانت کنار می‌روند.',
      Icon: ArchiveIcon,
    },
  ];

  return (
    <Modal
      open={column !== null}
      onClose={onClose}
      size="sm"
      title={column ? `حذف ستون «${column.title}»` : ''}
      description={`این ستون ${formatCount(load)} وظیفه دارد. پیش از حذف مشخص کنید چه بر سر آن‌ها بیاید.`}
      icon={<TrashIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="destructive"
            disabled={choice === 'migrate' && !targetId}
            onClick={() =>
              onConfirm(
                choice === 'migrate' ? { kind: 'migrate', targetColumnId: targetId } : { kind: 'archive' },
              )
            }
          >
            {choice === 'migrate' ? 'انتقال و حذف ستون' : 'بایگانی و حذف ستون'}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">سرنوشت وظایف این ستون</legend>
        {options.map(({ value, title, description, Icon }) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              choice === value ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
            )}
          >
            <input
              type="radio"
              name={`${id}-choice`}
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-primary">
                <Icon size={16} className="text-fg-tertiary" />
                {title}
              </span>
              <span className="text-caption text-fg-tertiary">{description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {choice === 'migrate' && (
        <div className="mt-4">
          <Select
            label="ستون مقصد"
            hideLabel={false}
            value={targetId}
            onValueChange={setTargetId}
            options={others.map((entry) => ({
              value: entry.id,
              label: entry.title,
              icon: <ColumnDot column={entry} />,
            }))}
          />
        </div>
      )}
    </Modal>
  );
}
