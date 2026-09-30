'use client';

import { useEffect, useLayoutEffect } from 'react';

/** `useLayoutEffect` on the client, `useEffect` on the server — silences the SSR warning. */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
