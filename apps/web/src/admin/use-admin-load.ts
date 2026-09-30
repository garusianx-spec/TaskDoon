'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isProblem } from '@/api/http';
import { problemMessage } from '@/api/messages';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { useAdmin } from './AdminSession';

export interface AdminLoad<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads one admin view: again when `key` changes, after a step-up, or on `reload()`. Answers
 * that arrive after a newer request started are dropped. `load` may change every render; only
 * `key` decides when to load again. `key: null` loads nothing.
 */
export function useAdminLoad<T>(key: string | null, load: () => Promise<T>): AdminLoad<T> {
  const { call, generation } = useAdmin();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: key !== null });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  useIsomorphicLayoutEffect(() => {
    loadRef.current = load;
  });
  const latest = useRef(0);

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const ticket = ++latest.current;
    setState((current) => ({ ...current, error: null, loading: true }));
    call(() => loadRef.current()).then(
      (data) => {
        if (ticket === latest.current) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (ticket !== latest.current || isProblem(error, 'STEP_UP_REQUIRED') || isProblem(error, 'SMS_CONFIRMATION_REQUIRED')) return;
        setState((current) => ({ ...current, error: problemMessage(error, 'بارگذاری این بخش ممکن نشد.'), loading: false }));
      },
    );
  }, [key, generation, nonce, call]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}
