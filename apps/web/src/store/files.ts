'use client';

import { useEffect, useState } from 'react';
import type { Attachment } from '@taskin/contracts';

export type FileDisposition = 'inline' | 'attachment';

/** Turns a stored file into a short-lived URL; the live store registers one, the demo has none. */
export type FileResolver = (attachmentId: string, disposition: FileDisposition) => Promise<string | null>;

let resolver: FileResolver | null = null;

export function setFileResolver(next: FileResolver | null): void {
  resolver = next;
}

/**
 * Where a file's bytes can be read: its own `url` (a local preview, or a fixture that has one),
 * else a signed link from the API. `null` when there is none (demo fixtures ship no binaries).
 */
export async function resolveFileUrl(attachment: Pick<Attachment, 'id' | 'url'>, disposition: FileDisposition): Promise<string | null> {
  if (attachment.url) return attachment.url;
  if (!resolver) return null;
  try {
    return await resolver(attachment.id, disposition);
  } catch {
    return null;
  }
}

/**
 * The URL to show or play a file in place (`inline`), once known. Components render their
 * placeholder until then, so the server render and the first client render agree.
 */
export function useFileUrl(attachment: Pick<Attachment, 'id' | 'url'> | null, disposition: FileDisposition = 'inline'): string | null {
  const [resolved, setResolved] = useState<{ readonly id: string; readonly url: string | null } | null>(null);
  const id = attachment?.id ?? null;
  const own = attachment?.url ?? null;

  useEffect(() => {
    if (!id || own) return;
    let live = true;
    void resolveFileUrl({ id, url: null }, disposition).then((url) => {
      if (live) setResolved({ id, url });
    });
    return () => {
      live = false;
    };
  }, [id, own, disposition]);

  if (own) return own;
  return resolved && resolved.id === id ? resolved.url : null;
}
