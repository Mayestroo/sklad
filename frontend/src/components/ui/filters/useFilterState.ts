'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readRemembered, remember } from '@/lib/usePersistentState';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { activeKeys, filtersFromQuery, queryWithFilters, type FilterValues } from '@/lib/list-filters';

export interface FilterState<F extends FilterValues = FilterValues> {
  values: F;
  defaults: F;
  /** Merge a patch (one filter, or several from the phone sheet). Remembered for this user and page. */
  set: (patch: Partial<F>) => void;
  /** Back to the defaults (search cleared too). */
  reset: () => void;
  search: string;
  setSearch: (q: string) => void;
  /** Search after typing pauses — what the page sends to the API. */
  debouncedSearch: string;
  /** Number of filters differing from the default (search not counted). */
  activeCount: number;
  hasSearch: boolean;
}

/** Signed-in user id (AuthContext keeps it in localStorage), so two people on one browser keep their own views. */
function userKey(): string {
  try {
    const raw = window.localStorage.getItem('crm_user');
    const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined;
    return id || 'anon';
  } catch {
    return 'anon';
  }
}

function initial<F extends FilterValues>(storeKey: string, defaults: F, searchKey: string): { values: F; search: string } {
  if (typeof window === 'undefined') return { values: defaults, search: '' };
  const fromUrl = filtersFromQuery(window.location.search, defaults, searchKey);
  if (fromUrl) return { values: fromUrl.values as F, search: fromUrl.search };
  const saved = readRemembered<Partial<F>>(storeKey, {});
  const values = { ...defaults };
  for (const k of Object.keys(defaults) as Array<keyof F>) {
    const v = saved[k];
    if (typeof v === 'string') values[k] = v as F[keyof F];
  }
  return { values, search: '' };
}

/**
 * Filters of one list page. The URL is the source of truth (a link or Back opens
 * the same view); without filters in the URL the last view this user chose on
 * this page is restored and written into the URL. Never decides API parameters:
 * the page maps `values` to its existing request.
 */
export function useFilterState<F extends FilterValues>(pageKey: string, defaults: F, opts: { searchKey?: string; debounceMs?: number } = {}): FilterState<F> {
  const searchKey = opts.searchKey ?? 'q';
  const storeKey = useMemo(() => `filters.${typeof window === 'undefined' ? 'anon' : userKey()}.${pageKey}`, [pageKey]);
  const [state, setState] = useState(() => initial(storeKey, defaults, searchKey));
  const debouncedSearch = useDebouncedValue(state.search.trim(), opts.debounceMs ?? 350);

  const set = useCallback(
    (patch: Partial<F>) =>
      setState((prev) => {
        const values = { ...prev.values, ...patch } as F;
        remember(storeKey, values);
        return { ...prev, values };
      }),
    [storeKey],
  );
  const reset = useCallback(() => {
    remember(storeKey, defaults);
    setState({ values: defaults, search: '' });
    // defaults is a module-level constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const setSearch = useCallback((q: string) => setState((prev) => ({ ...prev, search: q })), []);

  // Mirror the view into the URL (replace, not push: filtering is not navigation).
  useEffect(() => {
    const next = queryWithFilters(window.location.search, state.values, defaults, debouncedSearch, searchKey);
    if (next !== window.location.search && !(next === '' && window.location.search === '?')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.values, debouncedSearch, searchKey]);

  const activeCount = activeKeys(state.values, defaults).length;
  return {
    values: state.values,
    defaults: defaults,
    set,
    reset,
    search: state.search,
    setSearch,
    debouncedSearch,
    activeCount,
    hasSearch: debouncedSearch !== '',
  };
}
