'use client';

import { useSyncExternalStore } from 'react';
import type { CalendarSystem } from '@taskin/jalali';

const KEY = 'taskdoon:calendar-system';
const DEFAULT_SYSTEM: CalendarSystem = 'jalali';
const listeners = new Set<() => void>();
let inMemoryPreference: CalendarSystem | undefined;

const getServerSnapshot = () => DEFAULT_SYSTEM;

function getSnapshot(): CalendarSystem {
  if (inMemoryPreference) return inMemoryPreference;
  try {
    return window.localStorage.getItem(KEY) === 'gregorian' ? 'gregorian' : DEFAULT_SYSTEM;
  } catch {
    return DEFAULT_SYSTEM;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) {
    inMemoryPreference = undefined;
    notify();
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function setCalendarSystem(system: CalendarSystem) {
  try {
    window.localStorage.setItem(KEY, system);
    inMemoryPreference = undefined;
  } catch {
    inMemoryPreference = system;
  }
  notify();
}

/** Shared browser preference. React uses the Jalali snapshot until hydration completes. */
export function useCalendarPreference() {
  const system = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { system, setCalendarSystem };
}
