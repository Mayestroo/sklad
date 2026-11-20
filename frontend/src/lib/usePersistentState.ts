'use client';

import { useCallback, useState } from 'react';

const PREFIX = 'sklad.ui.';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * useState that remembers its value per browser (filters, tabs, table density,
 * chosen period…). UI conveniences only — never business data. The saved value
 * is read on the first render, so a page fetches with it straight away (no
 * second request). Use it in screens rendered inside the signed-in AppShell,
 * which render on the client only; storage failures fall back to `initial`.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(PREFIX + key, JSON.stringify(resolved));
        } catch {
          /* private mode / quota: keep the in-memory value */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set] as const;
}

/** Read a remembered UI value once (e.g. the last warehouse as a form default). */
export function readRemembered<T>(key: string, fallback: T): T {
  return read(key, fallback);
}

/** Remember a UI value (e.g. the last warehouse chosen in a document). */
export function remember<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
