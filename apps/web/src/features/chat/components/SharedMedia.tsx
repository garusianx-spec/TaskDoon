'use client';

import { useEffect,useMemo,useState } from 'react';
import type { Message } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { Tabs } from '@/components/ui';
import { type SharedFile } from '@/features/chat/types/shared-media';
import { categorise } from '@/features/chat/lib/shared-media';
import { FilesPanel } from '@/features/chat/components/SharedFilesPanel';
import { MediaPanel,MediaPreviewModal } from '@/features/chat/components/SharedMediaPanel';
import { AudioPanel } from '@/features/chat/components/SharedAudioPanel';
import { LinksPanel } from '@/features/chat/components/SharedLinksPanel';

export type SharedMediaTab = 'files' | 'media' | 'audio' | 'links';

/**
 * "فایل‌های مشترک" in the conversation drawer: one tab per content type — documents,
 * photos & videos, audio and links — each with its count and its own empty state.
 */
export function SharedMedia({ thread, load }: { readonly thread: readonly Message[]; readonly load?: () => Promise<readonly Message[]> }) {
  const [tab, setTab] = useState<SharedMediaTab>('files');
  const [preview, setPreview] = useState<SharedFile | null>(null);
  // Live, the server lists everything ever shared here (not only the loaded page of history);
  // it is asked again whenever the thread grows.
  const [remote, setRemote] = useState<readonly Message[] | null>(null);
  useEffect(() => {
    if (!load) return;
    let live = true;
    void load()
      .then((messages) => {
        if (live) setRemote(messages);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [load, thread.length]);
  const shared = useMemo(() => categorise(remote ?? thread), [remote, thread]);

  const total = shared.files.length + shared.media.length + shared.audio.length + shared.links.length;

  return (
    <section aria-labelledby="shared-media-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 id="shared-media-title" className="text-title-sm font-semibold text-fg-primary">
          فایل‌های مشترک
        </h3>
        <span className="numeric text-caption text-fg-tertiary">{formatCount(total)}</span>
      </div>

      <Tabs
        ariaLabel="دسته‌بندی محتوای مشترک"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'files', label: 'اسناد', count: formatCount(shared.files.length) },
          { value: 'media', label: 'تصویر و ویدیو', count: formatCount(shared.media.length) },
          { value: 'audio', label: 'صوت', count: formatCount(shared.audio.length) },
          { value: 'links', label: 'پیوندها', count: formatCount(shared.links.length) },
        ]}
      >
        {tab === 'files' && <FilesPanel files={shared.files} />}
        {tab === 'media' && <MediaPanel media={shared.media} onPreview={setPreview} />}
        {tab === 'audio' && <AudioPanel audio={shared.audio} />}
        {tab === 'links' && <LinksPanel links={shared.links} />}
      </Tabs>

      <MediaPreviewModal entry={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
