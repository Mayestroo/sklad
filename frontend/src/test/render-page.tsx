import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Renders a page with a fresh TanStack Query client (no retries, no cache
 * shared between tests). Mock `@/context/AuthContext`, `next-intl` and
 * `@/lib/api` in the test file (see accounting/accounts/page.test.tsx).
 */
export function renderPage(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}
