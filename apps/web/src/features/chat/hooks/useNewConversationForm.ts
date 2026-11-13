'use client';

import { useMemo, useState } from 'react';
import type { AvatarTone } from '@taskin/contracts';
import { directory } from '@/store/directory';
import { seededUnit } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useFormSubmission } from '@/hooks/useFormSubmission';
import { departmentName } from '@/features/chat/components/ConversationPersonPicker';
import type { NewConversationModalProps } from '@/features/chat/components/NewConversationModal';
import type { ConversationDraft } from '@/store/workspace-reducer';

type Mode = 'direct' | 'group';
const GROUP_TONES: readonly AvatarTone[] = ['brand', 'teal', 'violet', 'amber', 'rose'];

export function useNewConversationForm({
  open,
  currentUserId,
  conversations,
  onSubmit,
}: Pick<NewConversationModalProps, 'open' | 'currentUserId' | 'conversations' | 'onSubmit'>) {
  const [mode, setMode] = useState<Mode>('direct');
  const [query, setQuery] = useState('');
  const [directId, setDirectId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<readonly string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [topic, setTopic] = useState('');
  const [touched, setTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const submission = useFormSubmission();

  useResetOnOpen(open, () => {
    setMode('direct');
    setQuery('');
    setDirectId(null);
    setMemberIds([]);
    setGroupName('');
    setTopic('');
    setTouched(false);
    setNameTouched(false);
    submission.reset();
  });

  const people = directory.users();
  const hasColleagues = people.some((user) => user.id !== currentUserId);
  const colleagues = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return people
      .filter((user) => user.id !== currentUserId)
      .filter((user) =>
        normalised
          ? `${user.fullName} ${user.jobTitle} ${departmentName(user)}`.toLowerCase().includes(normalised)
          : true,
      );
  }, [people, query, currentUserId]);

  const existingDirect = (userId: string): boolean =>
    conversations.some(
      (conversation) =>
        conversation.kind === 'direct' &&
        conversation.memberIds.length === 2 &&
        conversation.memberIds.includes(userId) &&
        conversation.memberIds.includes(currentUserId),
    );

  const directError =
    touched && mode === 'direct' && directId === null ? 'یک همکار را انتخاب کنید.' : undefined;
  const nameError =
    (touched || nameTouched) && mode === 'group' && groupName.trim().length === 0
      ? 'نام گروه الزامی است.'
      : undefined;
  const membersError =
    touched && mode === 'group' && memberIds.length === 0 ? 'دست‌کم یک عضو به گروه اضافه کنید.' : undefined;

  const save = (draft: ConversationDraft) =>
    submission.submit(draft, (commandId) => onSubmit(draft, commandId), 'گفتگو ایجاد نشد. دوباره تلاش کنید.');

  const submit = async () => {
    if (submission.isPending()) return;
    setTouched(true);
    if (mode === 'direct') {
      const user = directory.users().find((entry) => entry.id === directId);
      if (!user) return;
      await save({
        kind: 'direct',
        title: user.fullName,
        topic: '',
        memberIds: [currentUserId, user.id],
        tone: user.avatarTone,
      });
      return;
    }
    const name = groupName.trim();
    if (!name || memberIds.length === 0) return;
    await save({
      kind: 'group',
      title: name,
      topic: topic.trim(),
      memberIds: [currentUserId, ...memberIds],
      tone: GROUP_TONES[Math.floor(seededUnit(name) * GROUP_TONES.length)] ?? 'brand',
    });
  };

  const selectedDirect = directory.users().find((user) => user.id === directId);

  return {
    mode,
    setMode,
    query,
    setQuery,
    directId,
    setDirectId,
    memberIds,
    setMemberIds,
    groupName,
    setGroupName,
    topic,
    setTopic,
    setTouched,
    setNameTouched,
    colleagues,
    hasColleagues,
    existingDirect,
    directError,
    nameError,
    membersError,
    submit,
    selectedDirect,
    submission,
  };
}
