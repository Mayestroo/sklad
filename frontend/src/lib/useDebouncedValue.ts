'use client';

import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `delayMs`. Use it for
 * typed filters that go into a query endpoint, so a request is sent once
 * typing pauses instead of on every key. Pass a string or number: an object
 * built during render is new on every render and would never settle.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
