'use client';

import { useMemo, useState } from 'react';
import type { AvatarTone } from '@taskin/contracts';
import { directory } from '@/store/directory';
import { seededUnit } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { departmentName } from '@/features/chat/components/ConversationPersonPicker';
import type { NewConversationModalProps } from '@/features/chat/components/NewConversationModal';

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

  useResetOnOpen(open, () => {
    setMode('direct');
    setQuery('');
    setDirectId(null);
    setMemberIds([]);
    setGroupName('');
    setTopic('');
    setTouched(false);
  });

  const people = directory.users();
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
    touched && mode === 'group' && groupName.trim().length === 0 ? 'نام گروه الزامی است.' : undefined;
  const membersError =
    touched && mode === 'group' && memberIds.length === 0 ? 'دست‌کم یک عضو به گروه اضافه کنید.' : undefined;

  const submit = () => {
    setTouched(true);
    if (mode === 'direct') {
      const user = directory.users().find((entry) => entry.id === directId);
      if (!user) return;
      onSubmit({
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
    onSubmit({
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
    colleagues,
    existingDirect,
    directError,
    nameError,
    membersError,
    submit,
    selectedDirect,
  };
}
