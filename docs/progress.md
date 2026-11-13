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
- [x] A6 Integration + e2e tests on local Docker Postgres — int 28/28, e2e 2/2 after fixes 72d8b7e, 1c9efeb

### Phase B — muammolar.pdf
- [x] B0 Read every page (text + rasterized), `docs/muammolar-triage.md`
- [x] B1..B13: fixed B1 B2 B4 B5 B8 B9 B10 B11 B12; B3 already fixed (verified by test); B7 not reproducible (guard int test); B6, B13 owner decisions (D6, D7); format decision D8

### Phase C — final verification
- [~] C1 Full suite — partly run at fadcd55 (stopped by Claude Code for low memory), see Log
- [x] C2 Review: no secrets in diff; fixed F1 0f547b6, F2 aba7845 (+ API route contract test), F3 fadcd55
- [x] C3 No CR-only changes (diff identical with --ignore-cr-at-eol), no CRLF in index; untracked: owner's files only (.claude/, plan note, muammolar.pdf)

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

- F6 (round 2, seen in P6) CurrencyInput shows `1.000` / `0.000` in form
  inputs (old 3-decimal dot grammar, the one D8 exception), which reads as
  one thousand exactly like the old display. Changing it changes how users
  type numbers (decimal key, grouping while typing); needs a deliberate
  input-grammar decision and a manual check of every form. Listed for the
  owner.
- F7 (round 2, pre-existing, found in review) Cancelling a purchase
  payment through Finance (cancelTransaction) reverses the cash and the
  settlement but leaves the payment's journal entry (Dt 6010 / Kt
  5010/5110): FinanceService never touches the journal. Ledger and cash
  then disagree. Not changed (accounting flow change); listed for owner.
- F5 (round 2) Several automatic postings date their journal entry "now"
  instead of the document date: JournalService.autoPostPayment /
  autoPostInboundDoc / autoPost*Transfer / autoPostServiceAct, the
  dispatch invoice entry in sales-orders.service.ts, and the sales-return
  cancel reversal (`entryDate: new Date()`). CLAUDE.md says entries carry
  the document date. Period closing is safe regardless (explicit
  document-date checks); fixing the dates changes ledger history, so it
  is left for a separate, reviewed change.

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

- C1 at the final commit fadcd55: backend lint, frontend tsc, frontend lint
  and frontend build were NOT RUN. Claude Code stopped the background
  suite because the machine was low on memory. Earlier evidence: backend lint
  on all changed backend files was clean when each was committed; frontend
  build passed at 19890ab; frontend lint was 123 problems at e40ce48 (all
  skipped react-hooks rules). To finish: `cd backend && npm run lint`,
  `cd frontend && npx tsc --noEmit && npm run lint && npm run build`.

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
- A6: sklad_test dropped/recreated (local Docker, disposable), `prisma migrate
  deploy --config prisma.test.config.ts`, then migrate diff vs schema: no
  drift. First run: int 27/28 (USD purchase return journal 20 instead of
  252,000 -> 72d8b7e), e2e 0/2 (API could not boot: BillingModule missing
  RateLimitModule -> 1c9efeb, plus app.module.spec.ts DI guard in the unit
  suite). After fixes: int 10 suites/28 tests pass, e2e 2/2 pass, backend
  unit 48 suites/437 tests pass.
- Env note: in Git Bash, `timeout <cmd>` dropped DATABASE_URL_TEST; run
  `DATABASE_URL_TEST=... node node_modules/jest/bin/jest.js ...` directly.
- C1 (fadcd55, partial): backend unit 49 suites / 439 tests pass;
  typecheck clean; nest build OK (dist/backend/src/main.js); integration
  11 suites / 30 tests pass; e2e 1 suite / 2 tests pass; frontend tests
  66/66 pass. Backend lint, frontend tsc, lint and build: NOT RUN (see above).

# Round 2 (2026-11-13) — Phases 1–7

Prompt summary: finish checks; D8 money format; D4 period closing (+A1);
D5 Redis throttler storage; D3 registration enumeration; B13/B6; D2 gap
account; react-hooks migration; visual verification; final verification.

## Round 2 task list
- [x] P1 backend lint, frontend tsc, frontend lint, frontend build (at 0acf6e2)
- [x] P2 shared money/quantity formatter (D8) + scan test — 15b05be
- [x] P3 accounting periods (D4) + A1 sales-return cancel — d8a9128
- [x] P4.4 pluggable throttler storage (D5, REDIS_URL) — 354592d
- [x] P4.5 registration enumeration (D3) — SKIPPED by the rule in the prompt (breaks registration UX), kept as owner decision D3
- [x] P4.6 B13 reading (62c3c7c) + B6 opening-balance labelling (3ee02fc)
- [x] P4.7 D2 purchase-return gap account setting
- [~] P5 react-hooks: shared data-loading + page migration — PARTLY DONE (88bad69, acccfaa): 123 -> 110, 6 pages migrated, rest listed below
- [x] P6 visual verification on local Docker DB (headless Edge, docs/screenshots/README.md)
- [x] P7 final verification, review, git hygiene

## Round 2 decisions

- P2: formatter lives in `shared/format/money.ts` (no imports, so both the
  Next app and Nest import it at runtime). UZS fractional amounts show 2
  decimals (`8 000,50`), not 1. Separator is NBSP (U+00A0), also between
  amount and code, so a currency code never wraps alone. Percentages use
  `formatPercent` (1 decimal, comma). Chart axes keep the B/M/K suffixes.
- P2: `CurrencyInput` keeps its editing grammar (dot decimal, comma groups
  while typing) — changing how people type numbers is not a display fix;
  it is the only allow-listed file in the scan test.
- P2: backend `toFixed(2)` calls are value rounding of stored amounts, not
  text; left unchanged (display-only rule).
- Tooling: the shell/Write layer turns a typed ` ` escape into a raw
  NBSP; code builds it with `String.fromCharCode(0xa0)` instead.

- P3: monthly UTC periods (no row = OPEN); reporting here is monthly and a
  year close is 12 month closes. Closing a month that has not ended is
  refused. Accountant may close, only company_admin reopens (safest
  default; owner may widen). Close/reopen audit row written with the
  transaction client (AuditService.logAction swallows errors, so it was
  not used). Draft-only deletes and payments / inventory documents (no
  document date, always "now") are not period-checked. No UI (API only).
- P3: deleteEntriesForSource always issues the deleteMany (no-op when
  nothing matches) so existing spec assertions keep their meaning.
- Tooling: typed backslash escapes are collapsed on the way into commands
  and files (a double backslash arrives as one); scripts use chr(92) / String.fromCharCode.

- P4.4: Redis failure -> count in memory (neither fail-open, which drops
  limits, nor fail-closed, which takes the API down with Redis). Fixed
  window in Redis vs sliding per-hit in memory (documented in the code).
  Added ioredis 5.8.2 exact. Local Redis container started with
  docker-compose (dev infra only); backend/.env REDIS_URL is localhost.

- P4.5: POST /auth/register answers with login tokens and the page signs
  the user straight in (AuthContext.register). An identical answer for a
  taken and a free email is only possible if the answer carries no
  tokens, i.e. with email confirmation, which the project has no mail
  provider for. That breaks the registration UX, so per the prompt it is
  skipped; timing equalisation alone is pointless while the bodies differ.
  Company slug is enumerable the same way (409 on a taken slug).
- P4.6 B13: reading = selling-side expenses recorded from Sales; Sales menu
  "Sotuv xarajatlari" opens Finance -> new expense (period expense).
  Drawer opened by a lazy useState initializer from ?new= (no effect).
  The ?new= stays in the URL after closing the drawer (harmless).
- P4.6 B6: no depreciation computed; notice on the tab, depreciation above
  cost rejected (server) / flagged (page) instead of clamped to 0.

- P4.7: setting lives in Company.settings.accounting (existing JSON
  section, no migration); typed DTO (4-digit code) and the code must exist
  in the tenant chart when saved and when posting. No default account.
  Behaviour change: such returns are refused until the setting exists
  (checklist). No settings UI.
- Slip (again): `git add docs` committed the owner's untracked plan note;
  amended out of the unpushed commit, file kept on disk. Staging explicit
  paths only from now on.

## Phase 5 status (react-hooks) — superseded by "Round 3" below

Approach: TanStack Query via `useApiQuery` / `useInvalidateApi`
(docs/frontend-data-loading.md). Component tests: Vitest + jsdom +
Testing Library, part of `npm test`.

Migrated (each with a component test: single load, error, retry):
accounting/accounts, accounting/journal, accounting/reports, sales/orders
(was the only useApiData user; useApiData deleted), settings/security,
purchases/suppliers. Lint 123 -> 110 (set-state-in-effect 70,
exhaustive-deps 40); the 2 React Compiler memo errors are gone.

NOT migrated in this run, by reason:

1. Same simple "load() in an effect" pattern, low risk, not done for time
   (recipe in the doc, ~15 min each incl. test): accounting/page,
   analytics, inventory/page, inventory/documents, inventory/transfers,
   products, purchases/page, purchases/[id], purchases/expenses,
   purchases/expenses/[id], purchases/returns, purchases/returns/[id],
   sales/page, sales/[id], sales/crm, sales/customers, sales/returns,
   sales/orders/[id], sales/prices, services, settings/billing,
   settings/branches, settings/sales, users, counterparties,
   (superadmin) admin, admin/announcements, admin/billing,
   admin/security, admin/tickets, admin/layout, [locale]/page (dashboard).
2. Forms that copy props into state in effects (reset/prefill):
   SalesInvoiceForm, SalesOrderForm, PurchaseDocumentForm,
   purchases/expenses/new, products/new, opening-balances, finance page
   drawer, CreateProductDrawer, CreateCounterpartyDrawer,
   QuickAddProductModal, CreateReturnModal, CreateSalesReturnModal,
   PartialDispatchModal, PayPurchaseModal, ServiceActDrawer,
   AktSverkaDrawer, SupplierProfileDrawer. Reason: the fix is a `key`
   remount plus lazy initial state; done blindly it can drop what a user
   typed or prefill the wrong document. Needs a manual click-through per
   form (not possible here: no visual check, see P6).
3. Not data loading (UI state synced from props/route): Sidebar (open
   groups from pathname), DatePicker (text from value), ThemeSwitcher
   (mounted flag), AuthContext (session restore), useDocumentDropdowns
   (uses lib/cache.ts; migrate together with SalesOrderForm). Reason:
   each needs a different, component-specific fix (derived state or
   useSyncExternalStore); out of the data-loading migration.

## Round 2 log
- P1 (at 0acf6e2, run one at a time, 2.1 GB RAM free): backend `npm run
  lint` clean, `--fix` changed nothing; frontend `npx tsc --noEmit` exit 0;
  frontend `eslint .` 123 problems in 60 files, all react-hooks
  (set-state-in-effect 76, exhaustive-deps 45, use-memo 1,
  preserve-manual-memoization 1) -> Phase 5; frontend `npm run build` OK.
- P2 15b05be: frontend tests 112/112; frontend tsc clean; backend
  typecheck clean; backend jest 49 suites / 440 tests; eslint on changed
  files clean except pre-existing react-hooks; frontend build OK; nest
  build OK. Scan test verified failing on the pre-change components.
- P3 d8a9128: migrations applied to local sklad_test only (migrate deploy
  via prisma.test.config.ts), both re-run cleanly (idempotent), migrate diff
  vs schema empty. Backend unit 50 suites / 468 tests; integration 12
  suites / 35 tests (new accounting-periods.int-spec 5/5); e2e 1 suite /
  2 tests pass; typecheck clean; eslint on changed files clean; nest build
  OK. Guards: 17 lifecycle checks + journal-writer scan fail on the old
  services (git stash); A1 test fails on the old sales service.
- P4.4 354592d: unit 51 suites / 476 tests; rate-limit specs 18; Redis
  int-spec 3/3 on local Redis (REDIS_URL_TEST=redis://127.0.0.1:6379/15);
  e2e 2/2 with REDIS_URL set, counters seen in Redis db 15 (then
  flushed); typecheck, eslint, nest build clean.
- P4.6 62c3c7c + 3ee02fc: frontend tests 120/120 (B13 spec 3 and B6 spec 3
  fail on the old code); frontend tsc clean; eslint on changed files only
  pre-existing react-hooks; frontend build OK; backend unit 51 suites /
  477 tests; backend typecheck clean.
- P4.7: purchase-returns spec 3 new cases and tenants spec 3 new cases
  (5 failed before the change); backend unit 51 suites / 483 tests;
  integration 12 suites / 35 tests (+3 Redis skipped without
  REDIS_URL_TEST); typecheck, eslint, nest build clean.
- P5 88bad69 (batch 1) + acccfaa (batch 2): frontend node tests 120/120,
  component tests 13/13 (error/retry cases fail on the old pages), tsc
  clean, eslint 110 problems (all react-hooks, listed above), build OK.
  Added deps (pinned): @tanstack/react-query 5.104.5; dev: vitest 4.1.12,
  jsdom 30.1.3, @testing-library/react 16.3.3, @testing-library/dom 10.4.2.
- P6: local sklad_demo DB (Docker), backend dist + frontend prod build,
  headless Edge via CDP (extension declined). 11 screenshots, findings in
  docs/screenshots/README.md. Fixed one miss found there: inventory stock
  printed raw `1250.5 dona` -> formatQuantity (`1 250,5 dona`), pinned in
  money-format-scan.spec.ts, re-shot after rebuild. Servers stopped.
- P7 final run (at 55866e5 + docs): backend jest 51 suites / 484 tests;
  typecheck exit 0; nest build exit 0; backend lint exit 0 (no --fix
  changes); integration 13 suites / 38 tests (incl. Redis int-spec with
  REDIS_URL_TEST); e2e 1 suite / 2 tests. Frontend node tests 121/121,
  component tests 6 files / 13 tests, tsc exit 0, eslint 110 problems
  (70 errors set-state-in-effect, 40 warnings exhaustive-deps: the
  Phase 5 remainder), build exit 0.
- P7 found and fixed 55866e5: app.close() hung when REDIS_URL pointed at
  an unreachable Redis (QUIT never resolves); shutdown now bounded.
- P7 review (diff 0acf6e2..HEAD, 115 files): no secrets; every new route
  has PermissionsGuard + a catalog permission (contract specs pass); all
  new queries filter by tenantId (period rows, journal deletion, gain
  account, settings check); query cache keyed by tenant; D2 gap in UZS
  like the other return lines; journal writes only in JournalService
  (scan test); status-changing paths pinned in period-lock.spec.ts.
  Residual: JournalService calls made without a transaction client
  (autoPost* default db) still check the period but the advisory lock
  ends with the statement. Fresh deploy: sklad_demo migrated from empty,
  booted, auto-seeded (incl. accounting:close/reopen grants); e2e boot
  passes; app.module.spec DI test passes.
- P7 git: no CR-only changes (stat identical with --ignore-cr-at-eol), no
  CRLF in the index for changed files; untracked: .claude/, the plan
  note, muammolar.pdf (owner's). Local leftovers (disposable): Docker
  databases sklad_test, sklad_demo; sklad_redis container running.

# Round 3 (2026-11-13) — owner decisions, Phase 5 completion

Scope set by the owner: code work only. Nothing production-related was
touched or configured (payment providers, Neon, env values/secrets, Redis
setup, backups, hosting, legal); those items stay in
`docs/pre-release-checklist.md` as they were, to be gone through together
before production.

## Round 3 decisions (owner)

- D3 (a) email-confirmation sign-up, console mail transport only: d7a5dab.
- D6 option 2, opening fixed-asset lines link a register asset, no
  depreciation there: 8f73fc0 (existing column, no migration).
- D7 B13 reading confirmed (no change). D9 (b) trailing zeros: ab01952.
- Period reopen: company admin only, as implemented (no change).
- D1, D2, D10 stay under "Decisions needed from owner". The decided items
  moved to "Decided by owner" in the checklist.

## Round 3 task list

- [x] R3.1 D3 / D6 / D9 code (d7a5dab, 8f73fc0, ab01952).
- [x] R3.2 simple pages on TanStack Query, component test per page, no
      disable comments: batches 3–7 (bd5a8b7, 8af5d0e, fcad9ba, 8965e80,
      ef4899a), batch 8 (e032d96: sales returns, prices, counterparties),
      batch 9 (c51792b: dashboard, super-admin pages + layout guard).
- [x] R3.3 forms/modals and non-data components listed below with the
      manual click-through; the safe ones migrated in 3dc53e0.
- [x] R3.4 migrations: only D3 adds one (`20261113000200_pending_registrations`),
      built and tested on the local Docker database only, listed in the
      checklist as "apply to Neon later". Not applied anywhere else.

New in the data-loading toolkit (docs/frontend-data-loading.md):
`useApiQuery` options `scope: 'platform'` (super-admin endpoints, no
company needed, never sends `X-Tenant-Id`) and `keepPrevious`; the
`useDebouncedValue` hook for typed filters.

## Phase 5 — left for a manual click-through

Lint at the start of round 3: 70 problems (set-state-in-effect 52,
exhaustive-deps 18). Now: **39** (31 + 8), all in the files below. No
disable comments were added.

Why these were not migrated: each copies props or a loaded document into
state the user then edits (or is shared UI every form depends on). The fix
is a `key` remount plus lazy initial state, or deriving the value; done
without clicking through it can drop what a user typed, prefill the wrong
document, or reset a form on a background reload. A visual check is not
possible in this environment (see P6).

### Forms and modals (15 files left; 2 migrated)

| File | What the effect does | Manual click-through must check |
|---|---|---|
| `components/sales/SalesOrderForm.tsx` | Copies dropdown lists from props once; sets currency/rate from the company default until the form is dirty; picks the first customer in create mode. | New order: default currency and rate appear, typing a rate is kept when the company settings finish loading; first customer preselected and changeable; edit an existing order: nothing is overwritten on open or after saving a line. Migrate together with `useDocumentDropdowns`. |
| `components/sales/SalesInvoiceForm.tsx` | Same default-currency sync; loads dropdowns in an effect; opens "unpost to edit" when the page is opened with `?edit=true` on a posted invoice. | New invoice: currency/rate default and typed rate kept; warehouse stock column fills; open a posted invoice with `?edit=true`: the unpost prompt appears once (not twice, not on every save). |
| `components/purchases/PurchaseDocumentForm.tsx` | "Unpost to edit" prompt for `?edit=true` on a posted receipt. | Posted receipt with `?edit=true`: prompt appears once; cancelling leaves the receipt posted; confirming unposts and keeps the lines. |
| `components/sales/CreateSalesReturnModal.tsx` | Loads warehouses (defect warehouse default) and the invoice's returnable items into editable rows when opened. | Open for an invoice: rows appear with 0 quantities; type quantities, wait 20 s (background reload), quantities stay; close and open for another invoice: rows belong to the new invoice. |
| `components/sales/PartialDispatchModal.tsx` | Resets dispatch quantities to the unshipped rest on opening; picks the order's warehouse. (Stock lookup migrated in 3dc53e0.) | Open: quantities = unshipped rest; change a quantity and the warehouse: the typed quantity stays, stock column reloads; close/open: quantities reset to the rest. |
| `components/purchases/CreateReturnModal.tsx` | Builds return rows from the receipt (landed unit cost, unreturned quantity) whenever the receipt or locale changes. | Open from a receipt: max quantities = unreturned; type quantities, switch language: typed quantities stay (today they reset). |
| `components/purchases/PayPurchaseModal.tsx` | On opening: amount = remaining, clears rate/note, loads cash accounts and picks the first account in the receipt currency. | Open for a USD receipt: amount = remaining, a USD kassa is preselected; change the amount, wait for accounts to load: amount stays. |
| `components/services/ServiceActDrawer.tsx` | On opening: loads the service catalog; fills the form from `initialData` or resets it. | New act: empty form with one line; edit an act: all fields and lines filled; typing then a parent re-render (e.g. list refresh) does not reset the form. |
| `components/counterparties/CreateCounterpartyDrawer.tsx` | On opening: fills from `counterpartyToEdit` or resets to defaults (type, folder). | Create from a folder: folder preselected; edit: all fields filled; type a name, the list behind refreshes: the name stays. |
| `components/products/CreateProductDrawer.tsx` | Reads custom units from localStorage; on opening fills from `productToEdit` or resets. | Edit a product: name in the current language, prices and currencies filled; custom units appear in the unit select; create: empty form. |
| `components/purchases/QuickAddProductModal.tsx` | On opening: item type from `initialType` (service forces unit "piece"). | Open from a service line: type = service, unit = piece; from a product line: type = product; the scanned SKU/barcode is prefilled. |
| `app/[locale]/(dashboard)/products/new/page.tsx` | While the sale price is 0, the sale-price currency follows the company default. | Company default USD: currency USD until a price is typed; type a price, then the default loads late: currency is not switched under the typed price. |
| `app/[locale]/(dashboard)/purchases/expenses/new/page.tsx` | Loads posted receipts/accounts in an effect; selecting a receipt selects all its lines; recalculates the allocation preview on every change. | Pick a receipt: all lines ticked, preview appears; untick a line, change the amount: preview recalculates once per change, ticks stay. |
| `app/[locale]/(dashboard)/finance/page.tsx` | List load in an effect (page, dates, tab, account, counterparty filters); drawer: currency follows the chosen account, open documents load per counterparty. | List: each filter change loads once, paging keeps filters; drawer: choose a USD kassa, currency = USD; choose a customer: open invoices listed, choosing another customer clears the chosen document. |
| `app/[locale]/(dashboard)/opening-balances/page.tsx` | Loads documents and the selected document's lines into editable state. | Open a draft: lines editable; type an amount, switch to another document and back: no stale lines from the other document; posted documents read-only. |
| `components/counterparties/AktSverkaDrawer.tsx` | Migrated (3dc53e0): read-only statement query. | — |
| `components/purchases/SupplierProfileDrawer.tsx` | Migrated (3dc53e0): read-only profile query. | — |

### Not data loading (3 left; 2 migrated)

| File | What the effect does | Manual click-through must check |
|---|---|---|
| `components/ui/DatePicker.tsx` | `mounted` flag for the portal; calendar month follows an external value change; view resets to days on opening. Used by every form. | In any form: open the picker, it shows the selected month; set the date from outside (e.g. "today" button / document load): the calendar follows; year view → close → reopen shows days. |
| `context/AuthContext.tsx` | Restores the session from localStorage on mount; listens for `crm_unauthorized`. | Reload while signed in: no flash of the login page, company kept; an expired token signs out once; super-admin impersonation survives a reload. Needs `useSyncExternalStore` or a server-provided session; touches every page. |
| `hooks/useDocumentDropdowns.ts` | Loads counterparties/warehouses/products (via `lib/cache.ts`) in an effect. | Migrate together with SalesOrderForm (it feeds that form). Check: dropdowns fill once per form opening, a created counterparty appears without reload. |
| `components/layout/Sidebar.tsx` | Migrated (3dc53e0): group open state adjusted during render. | — |
| `components/ui/ThemeSwitcher.tsx` | Migrated (3dc53e0): `useSyncExternalStore`. | — |

## Round 3 log

- R3.2 e032d96 (batch 8): sales returns, prices, counterparties.
  Counterparties requested the list twice on every load (now once);
  typed filters debounced through `useDebouncedValue`. Frontend node tests
  124/124, component tests 34 files / 80 tests, tsc 0, eslint on changed
  files clean.
- R3.2 c51792b (batch 9): dashboard (keepPrevious keeps numbers during a
  period switch; the test fails without it), five super-admin pages as
  platform queries (no `X-Tenant-Id`), layout guard deps. Component tests
  42 files / 101 tests; frontend lint 46; `next build` exit 0.
- R3.3 3dc53e0: statement and supplier drawers (old statement drawer
  showed the previous counterparty while loading the next), dispatch stock
  lookup, sidebar, theme (two switchers drifted apart after a toggle).
  Component tests 47 files / 115 tests; frontend lint 39.
- R3.4 (verification only, no commit): Docker Desktop started locally;
  new empty database `sklad_round3` on the local Docker Postgres; all
  migrations applied (`migrate deploy` via prisma.test.config.ts), re-run
  "No pending migrations", `migrate diff` "No difference detected".
  Backend unit 53 suites / 499 tests; typecheck 0; eslint (no --fix) 0;
  nest build 0; integration 13 suites / 38 tests (incl. Redis on
  127.0.0.1:6379/15); e2e 2 suites / 4 tests (incl. sign-up → email →
  confirm). Nothing applied to Neon.
- Local leftovers (disposable): Docker databases `sklad_round3`,
  `sklad_test`, `sklad_demo`; containers `sklad_postgres`, `sklad_redis`
  running.

# Round 4 (2026-11-13) — F5, admin revenue card, sales-document plan

Scope set by the owner: code work only; migrations on local Docker
databases only; no push/merge/deploy, no secrets, no non-local DB writes.
Checks after each commit (script): backend unit, typecheck, eslint (no
--fix), nest build, integration on local `sklad_test` (+ Redis db 15);
frontend node tests, component tests, tsc, eslint, `next build` when the
frontend changed.

## Round 4 status

| Item | Status | Commit | Notes |
|---|---|---|---|
| 1a F5 journal entry dates | done | e6cb885 | 6 patterns, test per pattern; see decisions |
| 1b Super-admin MRR card currency | done | fd169b3 | API returns MRR per currency; card shows rows / error / empty |
| Plan file committed | done | 4f88eb6 | |
| T1.1 product currency tests | already done | 0bce6d3 | 5 cases in products.service.spec.ts pass |
| T1.2 run focused product test | done | — | 16/16 |
| T1.3 schema + backfill migration | done | 992d187 | column/CHECK were in the baseline; production was built with db push, so the backfill gets its own idempotent migration 20261113000300, int-spec runs it twice |
| T1.4 create/update currency resolution | already done | 0bce6d3 | DTOs use IsValidCurrency; service resolves explicit → sales default, rejects unresolved nonzero price |
| T1.5 product form currency | done | b2b3b3f | create mode now starts from the tenant sales default or blank (was: USD guess via useDefaultCurrency, UZS guess on products/new); component test |
| T1.6 product checks | done | — | product spec 16/16, prisma validate OK, nest build OK |
| T2.1 price-conversion tests | done (coverage) | (this commit) | 5 cases existed (0bce6d3); added the two-decimal round-trip case the plan asks for; passes on the existing code |

## Round 4 decisions

- F5: `JournalEntryInput.entryDate` is now required (type) and checked at
  runtime in `createJournalEntry` (no "now" fallback). Manual entries
  (`createManualEntry`, typed by a user, no source document) are still
  dated when entered if no date is given; that is the only "now".
- F5: dates used: payment → `paymentDate`; inbound inventory document →
  `docDate`; transfer shipment → `transferDate`; transfer receipt →
  `receivedAt`; service act → `actDate`; dispatch invoice →
  `invoiceDate`; sales-return cancel → the return's `returnDate` (the
  cancel is already period-checked against `returnDate`, so the reversal
  lands in the same period as what it reverses).
- Existing journal rows untouched; checklist item "accountant to review
  historical entries dated at posting time".

- 1b: the MRR card assumed USD and the API summed subscription amounts
  across currencies (ADR 0023). `GET /super-admin/metrics` now returns
  `mrrByCurrency: [{ currency, amount }]` instead of `totalMrr` (only
  consumer is this card); the card lists one amount per currency, shows
  an explicit error (role=alert) when the rows or a row's currency are
  missing, and "no active subscriptions" when there are none.

- F8 (found in T1.5) useDefaultCurrency() falls back to USD (and to
  accounting/currency settings) when the tenant has no default; 32 files use
  it. Sales/product forms covered by the plan now use the strict
  useSalesDefaultCurrency() (null → blank). The other uses (purchases,
  finance, services, dashboards) are outside the plan; left as a finding.

## Needs owner decision (round 4)

- N1 (F5) Transfer receipt date. The transfer has one document date
  (`transferDate`); the receipt is a separate event recorded as
  `receivedAt`, which the service sets to the moment of receiving. Dating
  the receipt by `transferDate` would collapse the in-transit account 2920
  and refuse receipts of goods shipped in a now-closed month, so the
  receipt is dated by `receivedAt` (effectively "now"). Alternative: let
  the user enter a receipt date on the receive action.
