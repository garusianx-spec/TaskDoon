'use client';

import { useRef,useState } from 'react';
import type { AvatarTone,Department } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { problemMessage } from '@/lib/api-problem';
import { newIdempotencyKey } from '@/lib/api-client';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { ProjectDraft } from '@/store/workspace-reducer';
import { matchingProjectMembers,normalizeDepartmentName,projectDepartmentOptions,projectMemberIds,toggleProjectSelection } from '@/features/board/lib/project-form';
import type { CreateProjectModalProps } from '@/features/board/components/CreateProjectModal';

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

/** A Latin name gives its initials (`Mobile App` → `MA`); a Persian one a numbered key. */
function suggestKey(name: string, count: number): string {
  const initials = name.split(/\s+/).map(word => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean).map(word => word[0]).join('').toUpperCase().slice(0, 6);
  return KEY_PATTERN.test(initials) ? initials : `P${count + 1}`;
}

export function useProjectForm({ open, projectCount, departments, members, currentUserId, canCreateDepartment, onClose, onSubmit }: Pick<CreateProjectModalProps, 'open' | 'projectCount' | 'departments' | 'members' | 'currentUserId' | 'canCreateDepartment' | 'onClose' | 'onSubmit'>) {
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

  return { name, setName, setKey, setKeyEdited, color, setColor, departmentIds, departmentSearch, setDepartmentSearch, memberSearch, setMemberSearch, setNameTouched, setKeyTouched, selectionError, submitError, setSubmitError, saving, nameRef, keyRef, departmentSearchRef, effectiveKey, nameError, keyError, departmentOptions, normalizedSearch, matchingDepartments, existingDepartment, selectedMembers, visibleMembers, close, toggleDepartment, addDepartment, toggleMember, submit };
}
