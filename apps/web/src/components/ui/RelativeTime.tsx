'use client';

import { formatJalali, formatRelative } from '@taskin/jalali';
import { useNow } from '@/hooks/useNow';

export interface RelativeTimeProps {
  readonly iso: string;
  readonly className?: string;
}

/**
 * Renders a timestamp as "۵ دقیقه پیش" once mounted, and as an absolute Jalali date during
 * SSR so the markup is deterministic. Updates every minute. The `<time>` element carries the
 * machine-readable value for assistive tech and for copy/paste.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const now = useNow();

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {now ? formatRelative(iso, now) : formatJalali(iso, 'day-month')}
    </time>
  );
}
