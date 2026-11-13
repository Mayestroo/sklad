'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

/**
 * Stable query key of a GET endpoint. The tenant is part of it, so a
 * super-admin switching companies never sees another tenant's cached data;
 * the locale too, because the API localises some text.
 */
export function apiQueryKey(
  tenantId: string | null | undefined,
  endpoint: string,
  locale: string,
): readonly ['api', string | null, string, string] {
  return ['api', tenantId ?? null, endpoint, locale] as const;
}

export interface UseApiQueryOptions {
  /** false pauses the query (e.g. until a filter is chosen). */
  enabled?: boolean;
  /** ms the data is considered fresh; default from createQueryClient (15 s). */
  staleTime?: number;
}

/**
 * Loads `endpoint` (a GET path such as `/accounting/accounts?type=ASSET`)
 * with the current user's token, company and locale. `null` endpoint, no
 * token or no company: the query waits. Build the endpoint string from the
 * page's filters; a new string is a new query, the same string reuses the
 * cache, so there are no refetch loops.
 */
export function useApiQuery<T>(
  endpoint: string | null,
  options: UseApiQueryOptions = {},
): UseQueryResult<T, Error> {
  const { token, company } = useAuth();
  const locale = useLocale();
  const tenantId = company?.id;
  const ready = Boolean(endpoint && token && tenantId) && (options.enabled ?? true);

  return useQuery<T, Error>({
    queryKey: apiQueryKey(tenantId, endpoint ?? '', locale),
    queryFn: ({ signal }) =>
      apiFetch<T>(endpoint as string, {
        token: token ?? undefined,
        tenantId,
        locale,
        signal,
      }),
    enabled: ready,
    ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
  });
}

/**
 * Marks cached responses stale after a write so the pages showing them
 * reload. `prefix` matches endpoints by their start, e.g. `/sales/orders`
 * also refreshes `/sales/orders?status=NEW` and `/sales/orders/123`.
 */
export function useInvalidateApi(): (prefix: string) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    (prefix: string) =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'api' &&
          typeof query.queryKey[2] === 'string' &&
          query.queryKey[2].startsWith(prefix),
      }),
    [queryClient],
  );
}
