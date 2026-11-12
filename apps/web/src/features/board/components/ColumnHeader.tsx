'use client';

import { useEffect,useRef,useState } from 'react';
import type { BoardColumn } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { Badge,IconButton,Input,Popover,Tooltip } from '@/components/ui';
import { MenuItem,MenuList } from '@/components/ui/Menu';
import { ColumnDot } from '@/features/board/components/ColumnDot';
import { AddIcon,EditIcon,MoreHorizontalIcon,TrashIcon } from '@/components/icons';


interface ColumnHeaderProps {
  readonly column: BoardColumn;
  readonly count: number;
  readonly renaming: boolean;
  /** `false` on the status columns of views across projects: no ⋯ menu. */
  readonly editable: boolean;
  readonly canDelete: boolean;
  readonly existingTitles: readonly string[];
  readonly onStartRename: () => void;
  readonly onRename: (title: string) => void;
  readonly onCancelRename: () => void;
  readonly onDelete: () => void;
  readonly onCreateTask: () => void;
}

/** Column title row: colour key, name (inline-editable), count, add-task and the ⋯ menu. */
export function ColumnHeader({
  column,
  count,
  renaming,
  editable,
  canDelete,
  existingTitles,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
  onCreateTask,
}: ColumnHeaderProps) {
  const [draft, setDraft] = useState(column.title);
  const [error, setError] = useState<string | undefined>(undefined);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(column.title);
    setError(undefined);
  }, [renaming, column.title]);

  const commit = () => {
    const title = draft.trim();
    if (!title) return setError('نام ستون را وارد کنید.');
    if (existingTitles.some((existing) => existing.trim() === title)) return setError('ستونی با این نام وجود دارد.');
    onRename(title);
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  const cancel = () => {
    onCancelRename();
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  if (renaming) {
    return (
      <form
        className="flex flex-col gap-1 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <Input
          label={`نام تازه ستون ${column.title}`}
          hideLabel
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
          }}
          onBlur={(event) => {
            // Leaving the field by clicking elsewhere saves, unless focus moved to the
            // form's own buttons.
            if (!event.currentTarget.form?.contains(event.relatedTarget)) commit();
          }}
          error={error}
          maxLength={32}
          autoFocus
          className="h-8 text-body-sm"
        />
      </form>
    );
  }

  return (
    <header className="flex items-center gap-2 px-3 py-3">
      <ColumnDot column={column} />
      <h3 className="truncate text-title-sm font-semibold text-fg-primary">{column.title}</h3>
      <Badge tone="neutral" size="sm" numeric>
        {formatCount(count)}
      </Badge>
      <span className="ms-auto flex items-center gap-0.5">
        <Tooltip content={`افزودن وظیفه به ${column.title}`}>
          <IconButton
            label={`افزودن وظیفه به ${column.title}`}
            icon={<AddIcon size={16} />}
            size="xs"
            onClick={onCreateTask}
          />
        </Tooltip>
        {editable && (
          <Popover
            label={`اقدام‌های ستون ${column.title}`}
            haspopup="menu"
            align="end"
            panelClassName="min-w-48"
            trigger={
              <IconButton
                ref={menuTriggerRef}
                label={`اقدام‌های ستون ${column.title}`}
                icon={<MoreHorizontalIcon size={16} />}
                size="xs"
              />
            }
          >
            {(close) => (
              <MenuList>
                <MenuItem
                  icon={<EditIcon size={16} />}
                  onSelect={() => {
                    close();
                    onStartRename();
                  }}
                >
                  تغییر نام ستون
                </MenuItem>
                <MenuItem
                  icon={<TrashIcon size={16} />}
                  tone="danger"
                  disabled={!canDelete}
                  onSelect={() => {
                    close();
                    onDelete();
                  }}
                >
                  {canDelete ? 'حذف ستون' : 'حذف ستون (آخرین ستون بورد)'}
                </MenuItem>
              </MenuList>
            )}
          </Popover>
        )}
      </span>
    </header>
  );
}
