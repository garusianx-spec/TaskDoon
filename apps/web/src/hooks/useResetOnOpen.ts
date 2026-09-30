import { useState } from 'react';

/**
 * Runs `reset` in the render where a dialog opens, and again if `source` changes while it is
 * open. The dialog's first frame therefore already shows fresh state.
 *
 * Resetting in an effect instead paints the previous session for a frame before the effect
 * catches up. For example, «تبدیل یادداشت به وظیفه» would first show the last composer's title
 * and text. This uses React's "adjust state while rendering" pattern: `reset` may only call this
 * component's own setters, and React re-renders straight away, before anything is committed.
 */
export function useResetOnOpen(open: boolean, reset: () => void, source?: unknown): void {
  const [seen, setSeen] = useState<{ readonly open: boolean; readonly source: unknown }>({
    open: false,
    source: undefined,
  });
  if (seen.open === open && (!open || Object.is(seen.source, source))) return;
  setSeen({ open, source });
  if (open) reset();
}
