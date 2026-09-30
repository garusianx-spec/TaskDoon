'use client';

import { useEffect, useState } from 'react';

/**
 * A ticking clock that is `null` until the component has mounted.
 *
 * Anything phrased relative to "now" ("۵ دقیقه پیش", today's date) cannot be rendered on the
 * server: these routes are statically prerendered, so the server's clock is build time and
 * would never match the visitor's. Returning `null` on the first render lets callers emit a
 * deterministic absolute value for SSR and upgrade to the live phrasing after hydration —
 * which also keeps the timestamps ticking instead of freezing at page load.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
