'use client';

import { useState } from 'react';
import type { AvatarTone, DepartmentId } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { DEPARTMENTS } from '@/data/reference';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { ProjectDraft } from '@/store/workspace-reducer';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { BriefcaseIcon, FolderAddIcon } from '@/components/icons';
import { TONE_CLASSES, WORKSPACE_TONES } from '@/components/workspace/WorkspaceAvatar';
import { cn } from '@/lib/cn';

export interface CreateProjectModalProps {
  readonly open: boolean;
  /** How many projects exist, for the suggested key (`P1`, `P2`, …). */
  readonly projectCount: number;
  readonly onClose: () => void;
  readonly onSubmit: (draft: ProjectDraft) => void;
}

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;
const TONE_LABELS: Readonly<Record<AvatarTone, string>> = {
  brand: 'رنگ برند',
  teal: 'سبزآبی',
  violet: 'بنفش',
  amber: 'کهربایی',
  rose: 'صورتی',
  slate: 'خاکستری',
};

/** A Latin name gives its initials (`Mobile App` → `MA`); a Persian one a numbered key. */
function suggestKey(name: string, count: number): string {
  const initials = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 6);
  return KEY_PATTERN.test(initials) ? initials : `P${count + 1}`;
}

/**
 * "پروژه جدید": a name, the short Latin key that prefixes the project's task codes, a colour and
 * a department. Tasks need a project, so a new workspace starts here.
 */
export function CreateProjectModal({ open, projectCount, onClose, onSubmit }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<AvatarTone>('brand');
  const [departmentId, setDepartmentId] = useState<DepartmentId>('product');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

  useResetOnOpen(open, () => {
    setName('');
    setKey('');
    setKeyEdited(false);
    setColor('brand');
    setDepartmentId('product');
    setDescription('');
    setTouched(false);
  });

  const effectiveKey = keyEdited ? key : suggestKey(name, projectCount);
  const nameError = touched && !name.trim() ? 'نام پروژه الزامی است.' : undefined;
  const keyError =
    touched && !KEY_PATTERN.test(effectiveKey)
      ? `کلید باید با حرف لاتین شروع شود و ${toPersianDigits(2)} تا ${toPersianDigits(6)} حرف بزرگ یا عدد باشد.`
      : undefined;

  const submit = () => {
    setTouched(true);
    if (!name.trim() || !KEY_PATTERN.test(effectiveKey)) return;
    onSubmit({ name: name.trim(), key: effectiveKey, color, departmentId, description: description.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="پروژه جدید"
      description="وظایف هر پروژه با کلید آن شماره می‌خورند؛ مانند CRM-12."
      icon={<FolderAddIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ایجاد پروژه</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label="نام پروژه"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً: بازطراحی اپلیکیشن موبایل"
          error={nameError}
          maxLength={80}
          data-autofocus
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="کلید پروژه"
            dir="ltr"
            value={effectiveKey}
            onChange={(event) => {
              setKeyEdited(true);
              setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
            }}
            error={keyError}
            hint="۲ تا ۶ حرف لاتین بزرگ یا عدد"
            autoComplete="off"
            spellCheck={false}
          />
          <Select
            label="دپارتمان"
            hideLabel={false}
            value={departmentId}
            onValueChange={setDepartmentId}
            options={DEPARTMENTS.map((department) => ({ value: department.id, label: department.name, icon: <BriefcaseIcon size={15} /> }))}
          />
        </div>
        <Select
          label="رنگ پروژه"
          hideLabel={false}
          value={color}
          onValueChange={setColor}
          options={WORKSPACE_TONES.map((tone) => ({
            value: tone,
            label: TONE_LABELS[tone],
            icon: <span aria-hidden="true" className={cn('size-4 rounded-full', TONE_CLASSES[tone])} />,
          }))}
        />
        <Textarea
          label="توضیحات (اختیاری)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="هدف پروژه و دامنه کار"
          maxLength={500}
          className="min-h-20"
        />
      </form>
    </Modal>
  );
}
