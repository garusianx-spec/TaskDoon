'use client';

import { useState, type FormEvent } from 'react';
import type { NoteCategory } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { Button, Input, Modal, Popover } from '@/components/ui';
import { AddIcon, FolderAddIcon, TrashIcon } from '@/components/icons';

/**
 * Asks before a notebook goes. Nothing is deleted on the first click; and deleting a notebook
 * never deletes its notes: they stay in «همه یادداشت‌ها», filed in no notebook.
 */
export function DeleteCategoryDialog({
  category,
  noteCount,
  onClose,
  onConfirm,
}: {
  readonly category: { readonly id: string; readonly label: string } | null;
  readonly noteCount: number;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      open={category !== null}
      onClose={onClose}
      size="sm"
      title="آیا از حذف این دسته‌بندی اطمینان دارید؟"
      description={
        category
          ? noteCount > 0
            ? `دسته «${category.label}» حذف می‌شود. ${formatCount(noteCount)} یادداشت آن حذف نمی‌شود و بدون دسته در «همه یادداشت‌ها» می‌ماند.`
            : `دسته «${category.label}» حذف می‌شود. این دسته یادداشتی ندارد.`
          : ''
      }
      icon={<TrashIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            حذف دسته
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-fg-secondary">
        دسته‌های پیش‌فرض هم حذف‌شدنی‌اند؛ هر وقت خواستید می‌توانید با «افزودن دسته» دوباره بسازیدشان.
      </p>
    </Modal>
  );
}

/** "+ افزودن دسته": a dashed row above the categories that opens a one-field form. */
export function CreateCategoryButton({
  categories,
  onCreate,
}: {
  readonly categories: readonly NoteCategory[];
  readonly onCreate: (label: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <Popover
      label="دسته جدید"
      align="start"
      // As wide as the column, so the form never spills sideways out of it.
      className="mb-1 w-full"
      panelClassName="w-full min-w-0 p-3"
      onOpenChange={(open) => {
        if (!open) return;
        setLabel('');
        setError(undefined);
      }}
      trigger={
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-dashed border-primary px-2.5 text-start text-body-sm font-medium text-fg-tertiary transition-colors hover:border-brand hover:bg-brand-subtle/40 hover:text-fg-brand"
        >
          <AddIcon size={16} />
          افزودن دسته
        </button>
      }
    >
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            const name = label.trim();
            if (!name) return setError('نام دسته را وارد کنید.');
            if (categories.some((category) => category.label.trim() === name))
              return setError('دسته‌ای با این نام وجود دارد.');
            onCreate(name);
            close();
          }}
        >
          <Input
            label="نام دسته"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setError(undefined);
            }}
            placeholder="مثلاً: پژوهش کاربر"
            error={error}
            maxLength={24}
          />
          <Button type="submit" size="sm" iconStart={<FolderAddIcon size={16} />}>
            ایجاد دسته
          </Button>
        </form>
      )}
    </Popover>
  );
}
