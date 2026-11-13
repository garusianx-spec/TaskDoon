'use client';

import { useRef, useState } from 'react';
import { ApiProblem, newIdempotencyKey } from '@/lib/api-client';
import { codeMessage } from '@/lib/api-problem';

/** A dialog keeps the same command key when the user retries the same submitted values. */
export function useFormSubmission() {
  const pending = useRef(false);
  const attempt = useRef<{ signature: string | undefined; commandId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    attempt.current = null;
    setError(null);
  };

  const submit = async (
    value: unknown,
    save: (commandId: string) => Promise<unknown>,
    fallback: string,
  ): Promise<boolean> => {
    if (pending.current) return false;
    const signature = JSON.stringify(value);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { signature, commandId: newIdempotencyKey() };
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await save(attempt.current.commandId);
      attempt.current = null;
      return true;
    } catch (failure) {
      setError((failure instanceof ApiProblem && codeMessage(failure.code)) || fallback);
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return { error, saving, submit, reset, isPending: () => pending.current, clearError: () => setError(null) };
}
