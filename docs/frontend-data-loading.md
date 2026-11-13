# Frontend data loading

One approach for loading server data in pages and components:
**TanStack Query** (`@tanstack/react-query` 5.104.5, pinned) through two
project hooks in `frontend/src/lib/query/useApiQuery.ts`.

Why: the old pattern — `const load = async () => { setLoading(true); … }`
called from `useEffect` — is what the 123 `react-hooks` lint problems flag
(`set-state-in-effect`, `exhaustive-deps`), and "fixing" the dependency
lists by hand creates refetch loops. The project's own `useApiData` was used
by a single page and needed a disable comment, so it was replaced rather than
extended.

## Reading

```tsx
const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
const accounts = accountsQuery.data ?? [];

if (accountsQuery.isError) {
  return <LoadError error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />;
}
if (accountsQuery.isPending) return <Loading />;
```

- The hook adds the token, company (`X-Tenant-Id`) and locale; it waits
  while there is no token or company. Pass `null` as the endpoint (or
  `enabled: false`) to wait for something else.
- **Filters go into the endpoint string** (`/sales/orders?status=NEW&take=50`),
  built with `useMemo` from the filter state. The string is the query key: a
  new filter is a new request, the same filters reuse the cache. There is no
  `useEffect` and no dependency list to get wrong, so no refetch loops.
- The query key is `['api', tenantId, endpoint, locale]`: switching company
  never shows another tenant's cached data. The cache is cleared on logout.
- Defaults (`lib/query/query-client.ts`): fresh for 15 s, no refetch on window
  focus, one retry except for 4xx. Override `staleTime` per query for
  reference data (e.g. 5 minutes for counterparties).
- Errors are shown with `components/ui/LoadError.tsx` (message + retry).

## After a write

```ts
const invalidateApi = useInvalidateApi();
await apiFetch(`/sales/orders/${id}/status`, { method: 'PATCH', … });
void invalidateApi('/sales/orders'); // list, stats and details reload
```

Writes still call `apiFetch` directly (or `useMutation` if a page needs its
pending state). `invalidateApi(prefix)` marks every cached endpoint that
starts with the prefix stale; the ones on screen reload.

## Forms and modals

Do not copy props into state with an effect to "reset" a form. Give the form
component a `key` that changes when it should start over
(`<OrderForm key={order?.id ?? 'new'} … />`) and initialise state from props
in `useState(() => …)`.

## Tests

Component tests are `*.test.tsx` next to the page, run by Vitest + jsdom +
Testing Library (`npm run test:components`, also part of `npm test`). Render
with `renderPage()` from `src/test/render-page.tsx` (fresh query client, no
retries) and mock `@/lib/api`, `@/context/AuthContext` and `next-intl`. Each
migrated page has a test for the initial load (called once — no loop), the
error state and the retry. Keep `beforeEach(() => { mock.mockReset(); })` in
braces: a function returned from `beforeEach` is run as a cleanup hook.

## Migration status

See `docs/progress.md` (Phase 5): migrated pages, and pages left on the old
pattern with the reason.
