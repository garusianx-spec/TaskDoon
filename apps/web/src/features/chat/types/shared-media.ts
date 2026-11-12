import type { Attachment,Message } from '@taskin/contracts';
import { type SharedLink } from '@/lib/links';


export interface SharedFile {
  readonly message: Message;
  readonly attachment: Attachment;
}

export interface SharedAudio {
  readonly message: Message;
  readonly durationSec: number;
  readonly waveform: readonly number[];
  readonly src: string | null;
  /** The stored file, played through a signed link when there is no local `src`. */
  readonly attachmentId: string | null;
  readonly name: string;
}

export interface SharedLinkEntry {
  readonly message: Message;
  readonly link: SharedLink;
}
