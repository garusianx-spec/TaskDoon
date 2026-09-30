'use client';

import { formatTime } from '@taskin/jalali';
import { cn } from '@/lib/cn';
import { useHydrated } from '@/hooks/useHydrated';

export interface ClockTimeProps {
  readonly iso: string;
  readonly className?: string;
}

/**
 * A timestamp's clock time (۰۹:۳۰). The seed data is laid out from the browser's clock, so a
 * page prerendered at build time holds different minutes than the browser computes on load.
 * The time therefore appears only after hydration, behind an invisible placeholder of the
 * same width, and the first client render always matches the server HTML.
 */
export function ClockTime({ iso, className }: ClockTimeProps) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <span aria-hidden="true" className={cn(className, 'invisible')}>
        ۰۰:۰۰
      </span>
    );
  }
  return (
    <time dateTime={iso} className={className}>
      {formatTime(iso)}
    </time>
  );
}
