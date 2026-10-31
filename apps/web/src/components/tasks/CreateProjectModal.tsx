'use client';

import { useRef, useState } from 'react';
import type { AvatarTone, Department, User } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { DEPARTMENTS } from '@/data/reference';
import { problemMessage } from '@/api/messages';
import { newIdempotencyKey } from '@/api/http';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { ProjectDraft } from '@/store/workspace-reducer';
import { Avatar, Badge, Button, Checkbox, Input, Modal, Popover, Select } from '@/components/ui';
import {
  AddIcon, ChevronDownIcon, CloseIcon, FolderAddIcon, PeopleIcon, SearchIcon,
} from '@/components/icons';
import { WORKSPACE_TONES } from '@/components/workspace/WorkspaceAvatar';
import { matchingProjectMembers, normalizeDepartmentName, PROJECT_COLOR_SWATCHES, projectDepartmentOptions, projectMemberIds, toggleProjectSelection } from '@/lib/project-form';
import { DepartmentIcon } from './DepartmentIcon';

export interface CreateProjectModalProps {
  readonly open: boolean;
  /** How many projects exist, for the suggested key (`P1`, `P2`, …). */
  readonly projectCount: number;
  readonly departments: readonly Department[];
  readonly members: readonly User[];
  readonly currentUserId: string;
  readonly canCreateDepartment?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (draft: ProjectDraft, commandId: string) => Promise<void> | void;
}

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;
const TONE_LABELS: Readonly<Record<AvatarTone, string>> = {
  brand: 'رنگ برند', teal: 'سبزآبی', violet: 'بنفش',
  amber: 'کهربایی', rose: 'صورتی', slate: 'خاکستری',
};

/** A Latin name gives its initials (`Mobile App` → `MA`); a Persian one a numbered key. */
function suggestKey(name: string, count: number): string {
  const initials = name.split(/\s+/).map(word => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean).map(word => word[0]).join('').toUpperCase().slice(0, 6);
  return KEY_PATTERN.test(initials) ? initials : `P${count + 1}`;
}

/** The same multiselect interaction handles canonical departments and form-local additions. */
export function CreateProjectModal({
  open, projectCount, departments = DEPARTMENTS, members, currentUserId,
  canCreateDepartment = true, onClose, onSubmit,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<AvatarTone>('brand');
  const [departmentIds, setDepartmentIds] = useState<readonly string[]>([]);
  const [customDepartments, setCustomDepartments] = useState<readonly Department[]>([]);
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [memberIds, setMemberIds] = useState<readonly string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submission = useRef<{ signature: string; commandId: string } | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const keyRef = useRef<HTMLInputElement | null>(null);
  const departmentSearchRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, () => {
    setName(''); setKey(''); setKeyEdited(false); setColor('brand');
    const product = departments.find(entry => entry.id === 'product' || normalizeDepartmentName(entry.name) === 'محصول');
    setDepartmentIds(product ? [product.id] : []);
    setCustomDepartments([]); setDepartmentSearch('');
    setMemberIds(projectMemberIds([], currentUserId)); setMemberSearch('');
    setNameTouched(false); setKeyTouched(false); setSelectionError(null); setSubmitError(null);
    submission.current = null;
  });

  const effectiveKey = keyEdited ? key : suggestKey(name, projectCount);
  const nameError = nameTouched && !name.trim() ? 'نام پروژه را وارد کنید.' : undefined;
  const keyError = keyTouched && !KEY_PATTERN.test(effectiveKey)
    ? `کلید را با حرف لاتین شروع کنید و ${toPersianDigits(2)} تا ${toPersianDigits(6)} حرف بزرگ یا عدد بنویسید.` : undefined;
  const departmentOptions = projectDepartmentOptions(departments, customDepartments);
  const normalizedSearch = normalizeDepartmentName(departmentSearch);
  const matchingDepartments = departmentOptions.filter(entry => normalizeDepartmentName(entry.name).includes(normalizedSearch));
  const existingDepartment = departmentOptions.find(entry => normalizeDepartmentName(entry.name) === normalizedSearch);
  const selectedMembers = projectMemberIds(memberIds, currentUserId);
  const visibleMembers = matchingProjectMembers(members, memberSearch);

  const close = () => { if (!submitting.current) onClose(); };

  const toggleDepartment = (id: string) => {
    setSubmitError(null);
    if (!departmentIds.includes(id) && departmentIds.length >= 20) {
      setSelectionError('حداکثر ۲۰ دپارتمان انتخاب کنید.'); return;
    }
    setSelectionError(null);
    setDepartmentIds(current => toggleProjectSelection(current, id, 20));
  };

  const addDepartment = () => {
    const nextName = departmentSearch.trim().replace(/\s+/g, ' ');
    if (!nextName || !canCreateDepartment) return;
    if (!departmentIds.includes(existingDepartment?.id ?? '') && departmentIds.length >= 20) {
      setSelectionError('برای افزودن دپارتمان، یکی از ۲۰ انتخاب فعلی را بردارید.'); return;
    }
    const id = existingDepartment?.id ?? `custom-${newIdempotencyKey()}`;
    if (!existingDepartment) setCustomDepartments(current => [...current, { id, name: nextName, memberCount: 0 }]);
    setDepartmentIds(current => current.includes(id) ? current : [...current, id]);
    setDepartmentSearch(''); setSelectionError(null); setSubmitError(null);
    // The add button disappears once the new option exists; keep keyboard focus in the picker.
    departmentSearchRef.current?.focus();
  };

  const toggleMember = (id: string) => {
    if (id === currentUserId) return;
    setSubmitError(null);
    if (!selectedMembers.includes(id) && selectedMembers.length >= 100) {
      setSelectionError('حداکثر ۱۰۰ عضو برای پروژه انتخاب کنید.'); return;
    }
    setSelectionError(null);
    setMemberIds(current => toggleProjectSelection(projectMemberIds(current, currentUserId), id, 100));
  };

  const submit = async () => {
    if (submitting.current) return;
    setNameTouched(true); setKeyTouched(true); setSubmitError(null);
    if (!name.trim()) { nameRef.current?.focus(); setNameTouched(true); return; }
    if (!KEY_PATTERN.test(effectiveKey)) { keyRef.current?.focus(); setKeyTouched(true); return; }
    const draft: ProjectDraft = {
      name: name.trim(), key: effectiveKey, color, description: '',
      departmentId: departmentIds[0] ?? 'product', departmentIds,
      customDepartments: customDepartments.filter(entry => departmentIds.includes(entry.id)).map(({ id, name: departmentName }) => ({ id, name: departmentName })),
      memberIds: selectedMembers,
    };
    submitting.current = true; setSaving(true);
    try {
      const signature = JSON.stringify(draft);
      if (submission.current?.signature !== signature) submission.current = { signature, commandId: newIdempotencyKey() };
      await onSubmit(draft, submission.current.commandId);
    } catch (error) {
      setSubmitError(problemMessage(error, 'پروژه ثبت نشد. انتخاب‌ها حفظ شده‌اند؛ اتصال را بررسی و دوباره تلاش کنید.'));
    } finally {
      submitting.current = false; setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} size="md" title="پروژه جدید"
      description="وظایف هر پروژه با کلید آن شماره می‌خورند؛ مانند CRM-12."
      icon={<FolderAddIcon size={20} />} dismissOnOverlayClick={!saving}
      footer={<><Button variant="secondary" onClick={close} disabled={saving}>انصراف</Button>
        <Button onClick={() => void submit()} loading={saving}>{saving ? 'در حال ایجاد پروژه…' : 'ایجاد پروژه'}</Button></>}
    >
      <form className="flex min-w-0 flex-col gap-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={saving} className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Input ref={nameRef} label="نام پروژه" value={name} required
              onChange={event => { setName(event.target.value); setNameTouched(false); setSubmitError(null); }}
              onBlur={() => setNameTouched(true)} onFocus={() => setNameTouched(false)}
              placeholder="مثلاً: بازطراحی اپلیکیشن موبایل" error={nameError}
              maxLength={80} data-autofocus className="h-11" />
            <Input ref={keyRef} label="کلید پروژه" dir="ltr" value={effectiveKey} required
              onChange={event => { setKeyEdited(true); setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setKeyTouched(false); setSubmitError(null); }}
              onBlur={() => setKeyTouched(true)} onFocus={() => setKeyTouched(false)} error={keyError}
              hint="۲ تا ۶ حرف لاتین بزرگ یا عدد" autoComplete="off" spellCheck={false} className="h-11" />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">دپارتمان‌های پروژه</span>
            <Popover label="انتخاب دپارتمان‌های پروژه" constrainToViewport className="w-full"
              panelClassName="w-full min-w-0 p-3"
              trigger={<button type="button" aria-label="دپارتمان‌های پروژه" className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-primary bg-surface px-3.5 py-2 text-body text-fg-primary shadow-xs hover:bg-hover">
                <span>{departmentIds.length ? `${toPersianDigits(departmentIds.length)} دپارتمان انتخاب شده` : 'انتخاب دپارتمان‌ها'}</span><ChevronDownIcon size={16} />
              </button>}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <Input ref={departmentSearchRef} label="جستجو یا افزودن دپارتمان" value={departmentSearch} maxLength={60}
                  onChange={event => setDepartmentSearch(event.target.value)} iconStart={<SearchIcon size={16} />}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (canCreateDepartment && normalizedSearch) addDepartment(); } }}
                  placeholder="نام دپارتمان" className="h-11" />
                <div className="scrollbar-thin flex max-h-48 flex-col gap-1 overflow-y-auto" role="group" aria-label="گزینه‌های دپارتمان">
                  {matchingDepartments.map(department => {
                    return <Checkbox key={department.id} checked={departmentIds.includes(department.id)}
                      onCheckedChange={() => toggleDepartment(department.id)} className="size-11 rounded-lg"
                      label={<span className="flex min-h-11 items-center gap-2"><DepartmentIcon department={department} /><span className="break-words">{department.name}</span></span>} />;
                  })}
                  {matchingDepartments.length === 0 && <p className="py-2 text-body-sm text-fg-tertiary">دپارتمانی با این نام پیدا نشد.</p>}
                </div>
                {canCreateDepartment && normalizedSearch && !existingDepartment && <Button variant="secondary" iconStart={<AddIcon size={16} />} onClick={addDepartment} className="min-h-11 max-w-full whitespace-normal text-start">
                  افزودن دپارتمان «{departmentSearch.trim()}»
                </Button>}
                {!canCreateDepartment && <p className="text-caption text-fg-tertiary">برای افزودن دپارتمان جدید از مدیر سازمان کمک بگیرید.</p>}
              </div>
            </Popover>
            {departmentIds.length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="دپارتمان‌های انتخاب‌شده">
              {departmentOptions.filter(entry => departmentIds.includes(entry.id)).map(department => {
                return <Badge key={department.id} size="md" iconStart={<DepartmentIcon department={department} size={16} />} className="h-auto min-h-11 max-w-full gap-1.5 ps-2 pe-0">
                  <span className="min-w-0 break-words">{department.name}</span>
                  <button type="button" aria-label={`حذف دپارتمان ${department.name}`} onClick={() => toggleDepartment(department.id)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg-tertiary hover:bg-hover"><CloseIcon size={14} /></button>
                </Badge>;
              })}
            </div>}
          </div>

          <Select label="رنگ پروژه" hideLabel={false} value={color} onValueChange={setColor} className="[&>button]:min-h-11"
            options={WORKSPACE_TONES.map(tone => ({ value: tone, label: TONE_LABELS[tone],
              icon: <span aria-hidden="true" data-project-color={tone} className="inline-flex size-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: PROJECT_COLOR_SWATCHES[tone] }} />,
            }))} />

          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">اعضای پروژه</span>
            <Popover label="انتخاب اعضای پروژه" constrainToViewport className="w-full" panelClassName="w-full min-w-0 p-3"
              trigger={<button type="button" aria-label="اعضای پروژه" className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-primary bg-surface px-3.5 py-2 text-body text-fg-primary shadow-xs hover:bg-hover">
                <span className="flex min-w-0 items-center gap-2"><PeopleIcon size={18} />{toPersianDigits(selectedMembers.length)} عضو انتخاب شده</span><ChevronDownIcon size={16} />
              </button>}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <Input label="جستجوی اعضای سازمان" value={memberSearch} onChange={event => setMemberSearch(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}
                  placeholder="نام یا ایمیل عضو" iconStart={<SearchIcon size={16} />} className="h-11" />
                <div className="scrollbar-thin flex max-h-56 flex-col gap-1 overflow-y-auto" role="group" aria-label="گزینه‌های اعضای پروژه">
                  {visibleMembers.map(member => <Checkbox key={member.id} checked={selectedMembers.includes(member.id)}
                    disabled={member.id === currentUserId} onCheckedChange={() => toggleMember(member.id)} className="size-11 rounded-lg"
                    label={<span className="flex min-h-11 items-center gap-2"><span data-project-member-avatar={member.id}><Avatar name={member.fullName} initials={member.initials} tone={member.avatarTone} size="sm" decorative /></span>
                      <span className="flex min-w-0 flex-col"><span className="break-words">{member.fullName}</span><span aria-hidden="true" className="truncate text-caption text-fg-tertiary">{member.id === currentUserId ? 'سازنده پروژه' : member.jobTitle}</span></span>
                    </span>} />)}
                  {visibleMembers.length === 0 && <p className="py-2 text-body-sm text-fg-tertiary">عضوی با این نام یا ایمیل پیدا نشد.</p>}
                </div>
              </div>
            </Popover>
            <div className="flex flex-wrap gap-2" role="group" aria-label="اعضای انتخاب‌شده">
              {members.filter(member => selectedMembers.includes(member.id)).map(member => <Badge key={member.id} size="md"
                iconStart={<Avatar name={member.fullName} initials={member.initials} tone={member.avatarTone} size="xs" decorative />}
                className="h-auto min-h-11 max-w-full gap-1.5 ps-2 pe-0">
                <span className="min-w-0 break-words">{member.fullName}</span>
                {member.id === currentUserId ? <span className="px-2 text-caption text-fg-tertiary">سازنده پروژه</span>
                  : <button type="button" aria-label={`حذف عضو ${member.fullName}`} onClick={() => toggleMember(member.id)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg-tertiary hover:bg-hover"><CloseIcon size={14} /></button>}
              </Badge>)}
            </div>
          </div>
          {selectionError && <p role="alert" className="text-body-sm text-status-blocked">{selectionError}</p>}
        </fieldset>
        {submitError && <p role="alert" className="text-body-sm text-status-blocked">{submitError}</p>}
      </form>
    </Modal>
  );
}
