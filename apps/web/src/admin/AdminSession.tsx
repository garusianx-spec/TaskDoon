'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PlatformAdminMe } from '@taskin/contracts';
import { isProblem } from '@/api/http';
import { problemMessage } from '@/api/messages';
import { session } from '@/api/session';
import { IS_LIVE } from '@/lib/data-source';
import { adminApi } from './api';

export type AdminPhase =
  | { readonly kind: 'demo' }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'not-admin' }
  | { readonly kind: 'unavailable'; readonly admin: PlatformAdminMe }
  | { readonly kind: 'step-up'; readonly admin: PlatformAdminMe }
  | { readonly kind: 'ready'; readonly admin: PlatformAdminMe }
  | { readonly kind: 'error'; readonly message: string };

interface AdminContextValue {
  readonly phase: AdminPhase;
  /** Bumped after every step-up: screens reload what the step-up interrupted. */
  readonly generation: number;
  /** Asks the server who this is (after sign-in, after a step-up). */
  readonly probe: () => Promise<void>;
  /** Runs an admin call; STEP_UP_REQUIRED brings the password prompt back, a dead session the sign-in. */
  readonly call: <T>(work: () => Promise<T>) => Promise<T>;
  readonly steppedUp: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin outside AdminSession');
  return value;
}

/** The signed-in platform admin; only rendered in the `ready` phase. */
export function useAdminMe(): PlatformAdminMe {
  const { phase } = useAdmin();
  if (phase.kind !== 'ready') throw new Error('useAdminMe before the admin is ready');
  return phase.admin;
}

/**
 * The admin shell's session, apart from the workspace app's store: the same signed-in device
 * (the refresh cookie is shared), but nothing of any workspace is loaded here. Order of checks:
 * a session, the platform-admin flag (`/admin/me`, 404 for everyone else), the admin database,
 * and a password step-up in the last 15 minutes.
 */
export function AdminSession({ children }: { readonly children: ReactNode }) {
  const [phase, setPhase] = useState<AdminPhase>(IS_LIVE ? { kind: 'restoring' } : { kind: 'demo' });
  const [generation, setGeneration] = useState(0);

  const probe = useCallback(async () => {
    try {
      const me = await adminApi.me();
      setPhase(!me.available ? { kind: 'unavailable', admin: me } : me.stepUpRequired ? { kind: 'step-up', admin: me } : { kind: 'ready', admin: me });
    } catch (error) {
      if (isProblem(error, 'NOT_FOUND')) setPhase({ kind: 'not-admin' });
      else if (isProblem(error, 'UNAUTHENTICATED') || isProblem(error, 'SESSION_REVOKED')) setPhase({ kind: 'signed-out' });
      else setPhase({ kind: 'error', message: problemMessage(error) });
    }
  }, []);

  useEffect(() => {
    if (!IS_LIVE) return;
    let cancelled = false;
    void (async () => {
      const restored = await session.restore().catch(() => null);
      if (cancelled) return;
      if (restored) await probe();
      else setPhase({ kind: 'signed-out' });
    })();
    const unsubscribe = session.subscribe((current) => {
      if (!current) setPhase({ kind: 'signed-out' });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [probe]);

  const call = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (isProblem(error, 'STEP_UP_REQUIRED')) setPhase((current) => (current.kind === 'ready' ? { kind: 'step-up', admin: current.admin } : current));
      else if (isProblem(error, 'SESSION_REVOKED') || isProblem(error, 'UNAUTHENTICATED')) setPhase({ kind: 'signed-out' });
      throw error;
    }
  }, []);

  const steppedUp = useCallback(async () => {
    await probe();
    setGeneration((value) => value + 1);
  }, [probe]);

  const signOut = useCallback(async () => {
    await session.signOut();
    setPhase({ kind: 'signed-out' });
  }, []);

  const value = useMemo<AdminContextValue>(() => ({ phase, generation, probe, call, steppedUp, signOut }), [phase, generation, probe, call, steppedUp, signOut]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
