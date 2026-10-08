'use client';

import { useEffect, useState } from 'react';
import { useLive } from '@/store/WorkspaceProvider';
import { broadcastDismissalKey, dismissBroadcast, isBroadcastDismissed } from '@/lib/broadcasts';
import { BroadcastStrip } from './BroadcastStrip';

/** Platform notices only: demo data never creates a banner or calls the API. */
export function SystemBroadcastBanner() {
  const live = useLive();
  const store = live?.store ?? null;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [, storageRevision] = useState(0);
  useEffect(() => store?.watchBroadcasts(), [store]);
  useEffect(() => {
    const changed = () => storageRevision((value) => value + 1);
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  if (!live || (live.status.phase !== 'ready' && live.status.phase !== 'no-workspace')) return null;
  const items = live.status.broadcasts.filter((item) => !dismissed.has(broadcastDismissalKey(item)) && !isBroadcastDismissed(item));
  if (items.length === 0) return null;
  return (
    <section aria-label="اطلاعیه‌های پلتفرم" className="max-h-[35dvh] shrink-0 overflow-y-auto">
      {items.map((item) => (
        <BroadcastStrip key={broadcastDismissalKey(item)} message={item.message} level={item.level} onDismiss={() => {
          dismissBroadcast(item);
          setDismissed((current) => new Set([...current, broadcastDismissalKey(item)]));
        }} />
      ))}
    </section>
  );
}
