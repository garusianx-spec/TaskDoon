'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { supportError } from './support-client';
/** Visible-page polling: one request at a time; stale answers cannot replace a new selection. */
export function useSupportResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  interval = 5000,
) {
  const loader = useRef(load);
  useIsomorphicLayoutEffect(() => {
    loader.current = load;
  });
  const [state, setState] = useState<{ key: string; data: T | null; error: string }>({
    key: '',
    data: null,
    error: '',
  });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden' || controller.signal.aborted) return;
      pending = true;
      try {
        const data = await loader.current(controller.signal);
        if (!controller.signal.aborted) setState({ key, data, error: '' });
      } catch (e) {
        if (!controller.signal.aborted)
          setState((old) => ({ key, data: old.key === key ? old.data : null, error: supportError(e) }));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = interval > 0 ? setInterval(() => void refresh(), interval) : undefined;
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [key, nonce, interval]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : '', reload };
}
