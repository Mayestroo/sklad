import { QueryClient } from '@tanstack/react-query';

/**
 * The app's TanStack Query client (see docs/frontend-data-loading.md).
 *
 * Defaults match how pages behaved before the migration: data loads when a
 * page mounts, is reused for 15 s, and is not refetched just because the
 * window regains focus. A failed request is retried once, except for client
 * errors (4xx), which a retry cannot fix.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  });
}
