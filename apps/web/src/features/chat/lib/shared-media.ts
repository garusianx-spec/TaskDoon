import { formatJalali,formatTime } from '@taskin/jalali';
import { seededUnit } from '@/lib/format';
import type { AttachmentKind,Message } from '@taskin/contracts';
import { describeLink,extractUrls } from '@/lib/links';

import type { SharedFile,SharedAudio,SharedLinkEntry } from '@/features/chat/types/shared-media';

/** Deterministic pseudo-waveform for audio files, which (unlike voice memos) ship none. */
const syntheticWaveform = (seed: string): readonly number[] =>
  Array.from({ length: 40 }, (_, index) => Math.round((0.25 + seededUnit(`${seed}-${index}`) * 0.75) * 100) / 100);

export const stamp = (message: Message): string => `${formatJalali(message.sentAt, 'day-month')}، ${formatTime(message.sentAt)}`;

const MEDIA_KINDS: readonly AttachmentKind[] = ['image', 'video'];

const AUDIO_KINDS: readonly AttachmentKind[] = ['audio'];

/** 128 kbps: close enough to size an audio file's player when only its byte count is known. */
const AUDIO_BYTES_PER_SECOND = 16_000;

/** Sorts a thread's shared content into the four drawer categories, newest first. */
export function categorise(thread: readonly Message[]) {
  const files: SharedFile[] = [];
  const media: SharedFile[] = [];
  const audio: SharedAudio[] = [];
  const links: SharedLinkEntry[] = [];

  for (const message of thread) {
    const { body } = message;
    if (body.kind === 'voice') {
      audio.push({
        message,
        durationSec: body.durationSec,
        waveform: body.waveform.length > 0 ? body.waveform : syntheticWaveform(message.id),
        src: body.src,
        attachmentId: body.attachmentId ?? null,
        name: 'پیام صوتی',
      });
    } else if (body.kind === 'file') {
      const { attachment } = body;
      if (MEDIA_KINDS.includes(attachment.kind)) media.push({ message, attachment });
      else if (AUDIO_KINDS.includes(attachment.kind)) {
        audio.push({
          message,
          durationSec: Math.max(1, Math.round(attachment.size / AUDIO_BYTES_PER_SECOND)),
          waveform: syntheticWaveform(attachment.id),
          src: attachment.url,
          attachmentId: attachment.id,
          name: attachment.name,
        });
      } else files.push({ message, attachment });
      if (body.caption) for (const url of extractUrls(body.caption)) links.push({ message, link: describeLink(url) });
    } else if (body.kind === 'text') {
      for (const url of extractUrls(body.text)) links.push({ message, link: describeLink(url) });
    }
  }

  return { files: files.reverse(), media: media.reverse(), audio: audio.reverse(), links: links.reverse() };
}
