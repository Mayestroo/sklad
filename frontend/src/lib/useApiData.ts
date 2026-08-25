'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, RequestOptions } from './api';
import { getApiCache, setApiCache, setApiFetching, subscribeApiCache } from './cache';

export interface UseApiDataOptions extends RequestOptions {
  /**
   * Time in ms during which cached data is considered fresh.
   * Default: 15,000ms (15 seconds). For static reference data use e.g. 5 * 60 * 1000 (5 mins).
   */
  staleTime?: number;
  /**
   * Set to false to pause auto-fetching
   */
  enabled?: boolean;
}

export interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
  refetch: () => Promise<T | null>;
  mutate: (newData: T, shouldRevalidate?: boolean) => void;
}

export function useApiData<T>(
  endpoint: string | null,
  options: UseApiDataOptions = {}
): UseApiDataResult<T> {
  const { staleTime = 15000, enabled = true, ...fetchOptions } = options;

  // Initialize data from in-memory cache if available
  const cached = endpoint ? getApiCache<T>(endpoint) : undefined;
  const [data, setData] = useState<T | null>(cached ? cached.data : null);
  const [loading, setLoading] = useState<boolean>(!cached && enabled && Boolean(endpoint));
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (isBackground = false): Promise<T | null> => {
      if (!endpoint || !enabled) return null;

      if (!isBackground) {
        setLoading(true);
      } else {
        setIsRevalidating(true);
      }
      setError(null);
      setApiFetching(endpoint, true);

      try {
        const result = await apiFetch<T>(endpoint, fetchOptions);
        if (isMountedRef.current) {
          setData(result);
          setLoading(false);
          setIsRevalidating(false);
        }
        setApiCache(endpoint, result);
        return result;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
        if (isMountedRef.current) {
          setError(errorMsg);
          setLoading(false);
          setIsRevalidating(false);
        }
        return null;
      } finally {
        setApiFetching(endpoint, false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, enabled, JSON.stringify(fetchOptions)]
  );

  // Stale-While-Revalidate effect
  useEffect(() => {
    if (!endpoint || !enabled) return;

    const currentCached = getApiCache<T>(endpoint);
    const now = Date.now();

    if (currentCached) {
      setData(currentCached.data);
      setLoading(false);

      const isStale = now - currentCached.timestamp > staleTime;
      if (isStale && !currentCached.isFetching) {
        // Silently revalidate in background
        fetchData(true);
      }
    } else {
      // First time loading this endpoint
      fetchData(false);
    }

    // Subscribe to cache invalidation / changes from other components
    const unsubscribe = subscribeApiCache<T>(endpoint, (freshData) => {
      if (!isMountedRef.current) return;
      if (freshData === null) {
        // Cache was invalidated -> re-fetch
        fetchData(true);
      } else {
        setData(freshData);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [endpoint, enabled, staleTime, fetchData]);

  const mutate = useCallback(
    (newData: T, shouldRevalidate = false) => {
      if (!endpoint) return;
      setData(newData);
      setApiCache(endpoint, newData);
      if (shouldRevalidate) {
        fetchData(true);
      }
    },
    [endpoint, fetchData]
  );

  const refetch = useCallback(() => fetchData(false), [fetchData]);

  return {
    data,
    loading,
    isRevalidating,
    error,
    refetch,
    mutate,
  };
}
