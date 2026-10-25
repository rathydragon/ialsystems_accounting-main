import React, { memo, useRef, useSyncExternalStore } from 'react';

/**
 * Auto-sync countdown kept outside React state: the page ticks it every second, but only
 * <CountdownText> re-renders, not the whole page (and its table) once per second.
 */
export interface CountdownStore {
  get: () => number;
  /** Same call shape as a useState setter */
  set: (next: number | ((prev: number) => number)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createCountdownStore(initial: number): CountdownStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const v = typeof next === 'function' ? next(value) : next;
      if (v === value) return;
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One store per component instance; its `set` never changes identity. */
export function useCountdownStore(initial: number): CountdownStore {
  const ref = useRef<CountdownStore | null>(null);
  if (!ref.current) ref.current = createCountdownStore(initial);
  return ref.current;
}

export const CountdownText = memo(function CountdownText({ store, suffix = '' }: { store: CountdownStore; suffix?: string }) {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <>
      {value}
      {suffix}
    </>
  );
});
