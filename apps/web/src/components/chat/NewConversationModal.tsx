'use client';

import { useMemo, useState } from 'react';
import type { AvatarTone, Conversation, User } from '@taskin/contracts';
import type { ConversationDraft } from '@/store/workspace-reducer';
import { directory } from '@/store/directory';
import { DEPARTMENTS } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount, seededUnit } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  SegmentedControl,
} from '@/components/ui';
import { MessagesIcon, PeopleIcon, SearchIcon, UserIcon } from '@/components/icons';

export interface NewConversationModalProps {
  readonly open: boolean;
  readonly currentUserId: string;
  readonly conversations: readonly Conversation[];
  readonly onClose: () => void;
  readonly onSubmit: (draft: ConversationDraft) => void;
}

type Mode = 'direct' | 'group';

const GROUP_TONES: readonly AvatarTone[] = ['brand', 'teal', 'violet', 'amber', 'rose'];

const departmentName = (user: User): string =>
  DEPARTMENTS.find((entry) => entry.id === user.department)?.name ?? '';

/**
 * Start a one-to-one conversation or a team group. A direct chat with someone you already
 * talk to reopens the existing thread instead of creating a duplicate.
 */
export function NewConversationModal({
  open,
  currentUserId,
  conversations,
  onClose,
  onSubmit,
}: NewConversationModalProps) {
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
    return people.filter((user) => user.id !== currentUserId).filter((user) =>
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

  const directError = touched && mode === 'direct' && directId === null ? 'یک همکار را انتخاب کنید.' : undefined;
  const nameError = touched && mode === 'group' && groupName.trim().length === 0 ? 'نام گروه الزامی است.' : undefined;
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="گفتگوی جدید"
      description="با یک همکار گفتگوی شخصی شروع کنید یا برای تیم خود گروه بسازید."
      icon={<MessagesIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>
            {mode === 'direct'
              ? selectedDirect && existingDirect(selectedDirect.id)
                ? 'باز کردن گفتگو'
                : 'شروع گفتگو'
              : 'ایجاد گروه'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="نوع گفتگو"
          size="md"
          fullWidth
          value={mode}
          onValueChange={(next) => {
            setMode(next);
            setTouched(false);
          }}
          options={[
            { value: 'direct', label: 'گفتگوی شخصی', icon: <UserIcon size={16} /> },
            { value: 'group', label: 'گروه تیمی', icon: <PeopleIcon size={16} /> },
          ]}
        />

        {mode === 'group' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="نام گروه"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="مثلاً: تیم انتشار نسخه ۳"
              error={nameError}
              maxLength={60}
              data-autofocus
            />
            <Input
              label="موضوع (اختیاری)"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="هدف این گروه در یک جمله"
              maxLength={90}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">
              {mode === 'direct' ? 'گفتگو با' : 'اعضای گروه'}
            </span>
            {mode === 'group' && memberIds.length > 0 && (
              <Badge tone="brand" size="sm" numeric>
                {`${formatCount(memberIds.length + 1)} نفر با شما`}
              </Badge>
            )}
          </div>

          <Input
            label="جستجوی همکار"
            hideLabel
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام، سمت یا دپارتمان…"
            iconStart={<SearchIcon size={18} />}
            data-autofocus={mode === 'direct' ? '' : undefined}
          />

          {colleagues.length === 0 ? (
            <EmptyState
              compact
              icon={<SearchIcon size={18} />}
              title="همکاری پیدا نشد"
              description="عبارت جستجو را تغییر دهید."
            />
          ) : mode === 'direct' ? (
            <DirectPicker
              people={colleagues}
              selectedId={directId}
              onSelect={setDirectId}
              hasExisting={existingDirect}
            />
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto scrollbar-thin" aria-label="انتخاب اعضای گروه">
              {colleagues.map((user) => {
                const checked = memberIds.includes(user.id);
                return (
                  <li key={user.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[[aria-checked=true]]:border-brand">
                      <Checkbox
                        checked={checked}
                        size="sm"
                        ariaLabel={user.fullName}
                        onCheckedChange={(next) =>
                          setMemberIds((current) =>
                            next ? [...current, user.id] : current.filter((id) => id !== user.id),
                          )
                        }
                      />
                      <PersonSummary user={user} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {(directError ?? membersError) && (
            <p className="text-caption text-status-blocked" role="alert">
              {directError ?? membersError}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

interface DirectPickerProps {
  readonly people: readonly User[];
  readonly selectedId: string | null;
  readonly onSelect: (userId: string) => void;
  readonly hasExisting: (userId: string) => boolean;
}

/** Single-choice list with the ARIA radiogroup keyboard contract (arrows move and select). */
function DirectPicker({ people, selectedId, onSelect, hasExisting }: DirectPickerProps) {
  const { registerItem, onKeyDown } = useRovingFocus(people.length, 'vertical', {
    onActivate: (index) => {
      const person = people[index];
      if (person) onSelect(person.id);
    },
  });
  const selectedIndex = people.findIndex((person) => person.id === selectedId);

  return (
    <div
      role="radiogroup"
      aria-label="انتخاب همکار"
      onKeyDown={onKeyDown}
      className="flex max-h-72 flex-col gap-1.5 overflow-y-auto scrollbar-thin"
    >
      {people.map((user, index) => {
        const selected = user.id === selectedId;
        return (
          <button
            key={user.id}
            ref={registerItem(index)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onSelect(user.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-start transition-colors',
              selected ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-brand bg-brand-solid' : 'border-primary bg-surface',
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <PersonSummary user={user} />
            {hasExisting(user.id) && (
              <Badge tone="neutral" size="sm" className="ms-auto">
                گفتگوی موجود
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PersonSummary({ user }: { readonly user: User }) {
  return (
    <>
      <Avatar
        name={user.fullName}
        initials={user.initials}
        tone={user.avatarTone}
        size="sm"
        presence={user.presence}
        decorative
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-caption font-semibold text-fg-primary">{user.fullName}</span>
        <span className="truncate text-micro text-fg-tertiary">{`${user.jobTitle}، ${departmentName(user)}`}</span>
      </span>
    </>
  );
}
