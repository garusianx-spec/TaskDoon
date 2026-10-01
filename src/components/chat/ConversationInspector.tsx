'use client';

import { useMemo } from 'react';
import type { Conversation, Message } from '@/types';
import { formatCount } from '@/lib/format';
import { roleLabel } from '@/data/reference';
import { usersByIds } from '@/store/selectors';
import { Avatar, Badge, Button, IconButton, SwitchField } from '@/components/ui';
import { SharedMediaDrawer } from './SharedMediaDrawer';
import { CloseIcon, HashIcon, TaskSquareIcon, UserAddIcon } from '@/components/icons';

export interface ConversationInspectorProps {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly muted: boolean;
  readonly pinned: boolean;
  readonly onTogglePin: () => void;
  readonly onToggleMute: () => void;
  readonly onClose: () => void;
  /** Present when the conversation is a project channel. */
  readonly onOpenProjectBoard: (() => void) | null;
  readonly projectName: string | null;
}

/** Conversation details: members, the shared file drawer and notification preferences. */
export function ConversationInspector({
  conversation,
  messages,
  muted,
  pinned,
  onTogglePin,
  onToggleMute,
  onClose,
  onOpenProjectBoard,
  projectName,
}: ConversationInspectorProps) {
  const members = useMemo(() => usersByIds(conversation.memberIds), [conversation.memberIds]);

  return (
    <>
      <header className="flex shrink-0 items-start gap-2 border-b border-secondary p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            {conversation.kind === 'channel' && <HashIcon size={16} className="text-fg-tertiary" />}
            <h2 className="truncate text-title font-bold text-fg-primary">{conversation.title}</h2>
          </div>
          <p className="numeric text-caption text-fg-tertiary">
            {`${formatCount(members.length)} عضو، ${conversation.topic}`}
          </p>
        </div>
        <IconButton label="بستن پنل جزئیات" icon={<CloseIcon size={20} />} size="sm" onClick={onClose} />
      </header>

      <div className="flex flex-col gap-6 p-4">
        {onOpenProjectBoard && (
          <Button
            variant="secondary"
            fullWidth
            iconStart={<TaskSquareIcon size={16} />}
            onClick={onOpenProjectBoard}
          >
            {`مشاهده بورد وظایف ${projectName ?? 'پروژه'}`}
          </Button>
        )}

        <section aria-label="اعضای گفتگو">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-title-sm font-semibold text-fg-primary">اعضا</h3>
            <span className="numeric text-caption text-fg-tertiary">{formatCount(members.length)}</span>
            <Button size="xs" variant="secondary" className="ms-auto" iconStart={<UserAddIcon size={14} />}>
              افزودن عضو
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-hover">
                <Avatar
                  name={member.fullName}
                  initials={member.initials}
                  tone={member.avatarTone}
                  size="sm"
                  presence={member.presence}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm font-medium text-fg-primary">{member.fullName}</span>
                  <span className="truncate text-micro text-fg-tertiary">{member.jobTitle}</span>
                </span>
                <Badge tone="neutral" size="sm">
                  {roleLabel(member.role)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <SharedMediaDrawer conversationId={conversation.id} messages={messages} />

        <section aria-label="تنظیمات گفتگو" className="flex flex-col gap-3">
          <h3 className="text-title-sm font-semibold text-fg-primary">تنظیمات</h3>
          <SwitchField
            title="سنجاق کردن در بالای فهرست"
            description="این گفتگو همیشه بالای فهرست گفتگوها نمایش داده می‌شود."
            checked={pinned}
            onCheckedChange={onTogglePin}
          />
          <SwitchField
            title="بی‌صدا کردن اعلان‌ها"
            description="اعلان پیام‌های این گفتگو دریافت نمی‌شود."
            checked={muted}
            onCheckedChange={onToggleMute}
          />
        </section>
      </div>
    </>
  );
}
