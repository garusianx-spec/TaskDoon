'use client';

import { stamp } from '@/features/chat/lib/shared-media';

import { userById } from '@/store/selectors';
import { Avatar } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { StoredVoicePlayer } from '@/features/chat/components/VoicePlayer';
import { MicrophoneIcon } from '@/components/icons';

import type { SharedAudio } from '@/features/chat/types/shared-media';

export function AudioPanel({ audio }: { readonly audio: readonly SharedAudio[] }) {
  if (audio.length === 0) {
    return (
      <EmptyState
        compact
        icon={<MicrophoneIcon size={18} />}
        title="پیام صوتی یا فایل صوتی نیست"
        description="پیام‌های صوتی و فایل‌های صوتی این گفتگو با پخش‌کننده کوچک اینجا قرار می‌گیرند."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {audio.map((entry) => {
        const sender = userById(entry.message.authorId);
        return (
          <li
            key={entry.message.id}
            className="flex flex-col gap-2 rounded-lg border border-secondary bg-surface p-2.5"
          >
            <span className="flex items-center gap-2">
              {sender && (
                <Avatar
                  name={sender.fullName}
                  initials={sender.initials}
                  tone={sender.avatarTone}
                  size="xs"
                  decorative
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption font-semibold text-fg-primary">{entry.name}</span>
                <span className="truncate text-micro text-fg-tertiary numeric">{`${sender?.fullName ?? ''}، ${stamp(entry.message)}`}</span>
              </span>
            </span>
            <StoredVoicePlayer
              variant="inline"
              attachmentId={entry.attachmentId}
              durationSec={entry.durationSec}
              waveform={entry.waveform}
              src={entry.src}
              outgoing={false}
              label={`${entry.name} از ${sender?.fullName ?? 'کاربر'}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
