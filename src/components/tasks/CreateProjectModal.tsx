'use client';

import { useEffect, useState } from 'react';
import type { AvatarTone, DepartmentId, ProjectDraft } from '@/types';
import { DEPARTMENTS } from '@/data/reference';
import { USERS } from '@/data/workspace';
import { cn } from '@/lib/cn';
import { Avatar, Button, Checkbox, Input, Modal, Select, SwitchField } from '@/components/ui';
import { FolderIcon, MessagesIcon } from '@/components/icons';

export interface CreateProjectModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreate: (draft: ProjectDraft) => void;
  readonly currentUserId: string;
}

const TONES: ReadonlyArray<{ readonly id: AvatarTone; readonly label: string; readonly swatch: string }> = [
  { id: 'brand', label: 'برند', swatch: 'bg-brand-500' },
  { id: 'teal', label: 'سبز', swatch: 'bg-status-done' },
  { id: 'violet', label: 'بنفش', swatch: 'bg-status-review' },
  { id: 'amber', label: 'کهربایی', swatch: 'bg-status-progress' },
  { id: 'rose', label: 'قرمز', swatch: 'bg-status-blocked' },
  { id: 'slate', label: 'خاکستری', swatch: 'bg-gray-400' },
];

/**
 * Project composer.
 *
 * "ایجاد گفتگوی اختصاصی" defaults on: a new project without a place to talk about it is an
 * empty board, so the reducer spawns a channel named after the project and seeds it with a
 * system message. Turning it off is supported for projects that live inside an existing
 * channel.
 */
export function CreateProjectModal({ open, onClose, onCreate, currentUserId }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<DepartmentId>('product');
  const [color, setColor] = useState<AvatarTone>('brand');
  const [memberIds, setMemberIds] = useState<readonly string[]>([currentUserId]);
  const [createGroup, setCreateGroup] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDepartmentId('product');
    setColor('brand');
    setMemberIds([currentUserId]);
    setCreateGroup(true);
    setTouched(false);
  }, [open, currentUserId]);

  const error = touched && name.trim().length === 0 ? 'نام پروژه الزامی است.' : undefined;

  const submit = () => {
    setTouched(true);
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, departmentId, color, memberIds, createGroup });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="پروژه جدید"
      description="پروژه را تعریف کنید؛ در صورت تمایل گفتگوی اختصاصی آن هم به‌صورت خودکار ساخته می‌شود."
      icon={<FolderIcon size={20} variant="twotone" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ایجاد پروژه</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="نام پروژه"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً: راه‌اندازی درگاه پرداخت"
          error={error}
          autoFocus
        />

        <Select
          label="دپارتمان"
          hideLabel={false}
          value={departmentId}
          onValueChange={setDepartmentId}
          options={DEPARTMENTS.map((entry) => ({ value: entry.id, label: entry.name }))}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">رنگ پروژه</legend>
          <div role="radiogroup" aria-label="رنگ پروژه" className="flex flex-wrap gap-2">
            {TONES.map((tone) => {
              const selected = color === tone.id;
              return (
                <button
                  key={tone.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setColor(tone.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', tone.swatch)} aria-hidden="true" />
                  {tone.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">اعضای پروژه</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {USERS.map((user) => {
              const checked = memberIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[:checked]:border-brand"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      setMemberIds((current) =>
                        next ? [...current, user.id] : current.filter((id) => id !== user.id),
                      )
                    }
                    ariaLabel={user.fullName}
                    size="sm"
                  />
                  <Avatar
                    name={user.fullName}
                    initials={user.initials}
                    tone={user.avatarTone}
                    size="sm"
                    decorative
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-caption font-semibold text-fg-primary">
                      {user.fullName}
                    </span>
                    <span className="truncate text-micro text-fg-tertiary">{user.jobTitle}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-xl border border-secondary p-3">
          <SwitchField
            checked={createGroup}
            onCheckedChange={setCreateGroup}
            title="ایجاد گفتگوی اختصاصی پروژه"
            description={
              <span className="flex items-center gap-1">
                <MessagesIcon size={13} />
                کانالی هم‌نام پروژه در بخش گفتگوها ساخته و اعضا به آن اضافه می‌شوند.
              </span>
            }
          />
        </div>
      </div>
    </Modal>
  );
}
