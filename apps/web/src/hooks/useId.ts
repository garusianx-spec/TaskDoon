'use client';

import { useId as useReactId } from 'react';

/** Namespaced, SSR-stable id for wiring `aria-labelledby` / `aria-describedby`. */
export function useNamespacedId(prefix: string): string {
  const id = useReactId();
  return `${prefix}${id.replace(/:/g, '')}`;
}
