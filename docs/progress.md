# Progress log — refactor/quality-audit (autonomous run, 2026-11-13)

Running log for the autonomous pass (Phases A–C). Updated after every commit
so the work survives context compaction. Re-read this file, then
`docs/pre-release-checklist.md`, then the phase list below, after a compaction.

## Environment

- Docker Desktop is running; `sklad_postgres` (postgres:16-alpine) is up on
  `127.0.0.1:5432` with an existing disposable database `sklad_test`.
  DB-backed tests use, inline only (never written to `.env`):
  `DATABASE_URL_TEST=postgresql://sklad_user:sklad_password@127.0.0.1:5432/sklad_test`
- `backend/.env` points at Neon (real tenant data): never used for tests,
  seeds or migrations in this run.
- Disk: D: 25 GB free.

## Task list

### Phase A — open items
- [x] A1 Sales-return cancel in a closed period — SKIPPED: period closing is not implemented (no model, field, ADR or service). Recorded as owner decision D4.
- [x] A2 Pre-release checklist entries + "Decisions needed from owner"
- [x] A3 Second tenant sweep (ids from body/params/query, nested line ids),
      `assertTenantOwned` helper + guard test, `docs/tenant-isolation-sweep.md` — 5eb0313
- [x] A4a `/sales/purchases` page — removed page + GET /api/sales/purchases (e19cfdd)
- [x] A4b Excel opening-balance template: asset-type / useful-life columns removed, sheet read by header (a27fa8c)
- [~] A5 Frontend lint, by rule category — PARTLY DONE. no-explicit-any
      430 -> 0 (44a8e05), no-unused-vars 181 -> 0 (19890ab), parse error and
      1 of 3 compiler-memo errors fixed. SKIPPED: react-hooks
      set-state-in-effect (76) and exhaustive-deps (45), see below.
- [ ] A6 Integration + e2e tests on local Docker Postgres

### Phase B — muammolar.pdf
- [ ] B0 Read every page, write `docs/muammolar-triage.md`
- [ ] B1..B13 fix each problem (see triage file)

### Phase C — final verification
- [ ] C1 Full suite (backend unit, frontend tests, typecheck, build, lint, int/e2e)
- [ ] C2 Code review of branch diff vs main
- [ ] C3 Clean git status, no secrets, no line-ending-only changes mixed in

## Decisions made (by me, during this run)

- A3: legacy unit specs with hand-written Prisma mocks opt into a no-op
  `__mocks__/assert-tenant-owned.ts` (same convention as document-sequence);
  the real helper is covered by its own spec and tenant-isolation.spec.ts.
- A3: the guard scan sees DTO-typed and inline-object parameters only; the
  few ids passed as bare positional strings are listed by hand in the sweep doc.
- A4a: removing the orphan page is smaller than repointing it; /purchases is
  already the purchase-documents page. PurchaseOrder table kept (dropping it
  would delete data). No dedicated test: dead-code removal, verified by
  backend typecheck/build and frontend build having no remaining reference.
- A4b: removing the columns is smaller than honouring them (honouring needs
  new line columns + FixedAsset creation at posting). Old 7-column templates
  still import (header-based read, tested).
- A1: there is no accounting-period / books-closed concept anywhere
  (`grep -i period|closed|lock` over schema, services and ADRs). Building one
  is a product feature, not a fix, so A1 is skipped and listed as owner
  decision D4 in `docs/pre-release-checklist.md`.

## Findings to fix later (found while typing the frontend)

- F1 Inventory documents have no currency column (totals are UZS batch
  cost) but the inventory documents page formats them in the tenant default
  currency (`inventory/documents/page.tsx`). Phase C.
- F2 `PurchaseReturnDocumentForm` loads suppliers from `/counterparties`;
  the route is `/sales/counterparties`, so the supplier list is empty.
- F3 Counterparty orders summary (`/sales/orders/by-counterparty/:id`)
  sums totals across currencies (ADR 0023). Phase C.
- F4 `formatCurrency` prints 3 decimals ("8.000 UZS"), which reads as eight
  thousand in Uzbek/Russian notation; relevant to PDF item B2/B5.

## NOT RUN / skipped

- A5 react-hooks/set-state-in-effect (76) and react-hooks/exhaustive-deps
  (45), plus 2 React-Compiler memo errors in `src/lib/useApiData.ts`.
  Reason: these flag the app-wide data-loading pattern (an effect calls a
  fetcher that does `setLoading(true)` synchronously, then sets results), and
  "fixing" exhaustive-deps by adding dependencies can create refetch loops.
  Neither can be changed mechanically without behaviour risk, and the task
  forbids behaviour changes and blanket disables. A first attempt on
  useApiData made the compiler errors worse and was reverted.
  To finish: pick one data-loading primitive (extend `useApiData`, built on
  `useSyncExternalStore` over `lib/cache.ts`, or adopt a query library),
  migrate pages to it one module at a time with a manual check per page,
  and reset modal forms by remounting with `key` instead of effects.

## Baseline (before any change in this run)

- Backend `npx jest`: 45 suites, 417 tests, all pass. `npm run typecheck`: clean.
- Frontend `eslint .`: 738 problems (510 errors, 228 warnings) in 83 files:
  430 no-explicit-any, 181 no-unused-vars, 77 react-hooks/set-state-in-effect,
  46 react-hooks/exhaustive-deps, 2 preserve-manual-memoization, 1 use-memo,
  1 parse error.

## Log

- A1+A2: docs only (checklist + this file). Commit 8a24f5f.
- A3: 5eb0313. 75 entry points audited, 35 fixed. Backend jest 47 suites /
  433 tests pass; typecheck, eslint, nest build clean. The 6 new pattern
  tests and the guard were run against the old service code (git stash) and
  fail there.
- d7d5496: A3 follow-up bug: opening-balance line accountId is a CashAccount;
  the A3 check used the ledger Account model. Fixed with a pinning test.
- A4a e19cfdd, A4b a27fa8c. (A staging slip had put the A4a deletions into
  the d7d5496 commit; the three local commits were redone so each builds.)
- 2868e9c: fix(ui) company name rendered as object (4 sites), found via
  typing AuthContext. Not visually verified; helper pinned by spec.
- 44a8e05: frontend no-explicit-any 430 -> 0. Frontend tests 50/50, next
  build OK (after clearing stale generated .next/dev/types).
- Slip: a broad `git add docs` had committed the owner's untracked plan note
  (df61fdf); untracked again in a follow-up commit, file kept on disk.
- Tooling note: never pipe `< /dev/null` into `python - <<EOF` (starts a
  REPL); run edit scripts from files in the scratchpad.
