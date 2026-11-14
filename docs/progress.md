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
| `components/purchases/CreateReturnModal.tsx` | Fixed in round 4: typed quantities/VAT are the only state, rows derive from the receipt. | Covered by CreateReturnModal.test.tsx (language switch, reload, another receipt). |
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
| T2.1 price-conversion tests | done (coverage) | c05f5fc | 5 cases existed (0bce6d3); added the two-decimal round-trip case the plan asks for; passes on the existing code |
| T2.2 forms: no price list, native price currency | done | b58f5ee | price-list selector/auto-selection and native-currency conversion + repair error were already done (0bce6d3); new documents now start in the strict sales default or blank (see N2) |
| T2.3 backend price resolution | done | 16ea3ab | saved-currency conversion existed; removed the last 'UZS' fallback (zero price, no currency on product or request → 400). Price-list endpoints kept; no form calls GET products/:id/price |
| T2.4 sales checks | done | — | invoice/order specs pass; frontend build OK (after T2.2) |
| T3.1 order/invoice calculation tests | done (coverage) | afe8f02 | 2x100/10%/12% = 201.6, zero VAT, 100% discount, header = sum of lines; pass on the shared calculator from 0bce6d3 |
| T3.2 schema + DTO fields | done | b3b0ead | order VAT / return VAT columns and order/invoice DTO 0–100 checks existed; added SalesReturnItem.discount (provenance, already applied in unitPrice) + idempotent migration 20261113000400; return DTO carries no discount/VAT (derived from the invoice line, T3.6) |
| T3.3 order discount/VAT on create and draft update | done (coverage) | b620bcd | both paths use the shared calculator (0bce6d3); added the draft-update test (2 lines, 10% and 100% discount) |
| T3.4 VAT through partial dispatch | already done | 0bce6d3 | dispatch copies discount/VAT rates per line, sets header VAT, settles the VAT-inclusive total (existing dispatch test); exact-sum check in T3.7 |
| T3.5 invoice discount/VAT | already done | 0bce6d3 | createInvoice/draft update use the shared calculator; existing draft-invoice tests |
| T3.6 returns from source line | done | 454d2c6 | backend already derived price/VAT from the source line and ignored the client price; added source discount to the returnable-items API and the stored return line; modal shows it; returns-page create form now totals with VAT (was VAT-free) |
| T3.7 partial-dispatch and return regressions | done | d4a6266 | the tests failed: each shipment/return was rounded on its own (3x10.05 at 10%/12%: VAT 1.08+2.17=3.25 vs 3.26; three returns of 612.16/3 gave back 612.15). Shipments now bill cumulative-minus-previous line amounts, returns prorate cumulatively; both telescope to the source line. Applies to new documents only |
| T3.8 sales specs + schema validation | done | — | invoice/order/return specs pass, prisma validate OK, frontend build OK (T3.6) |
| T4.1 draft-edit tests | done | b13b569 | success without stock/ledger/settlement calls, 404, POSTED/CANCELLED refused, posted-after-read refused, rollback; int-spec on the local DB |
| T4.2 PATCH route | already done (see N3) | 0bce6d3 | route exists with sales:edit, full DTO |
| T4.3 atomic draft replacement | done | b13b569 | status was checked before the transaction; now SELECT … FOR UPDATE and re-check DRAFT inside it |
| T4.4 form save path | verified | — | SalesInvoiceForm saves drafts with PATCH /sales/invoices/:id; posted invoices keep explicit post/unpost |
| T4.5 invoice checks | done | — | backend unit/int/typecheck/lint/build; frontend unchanged |
| T5.1 profit currency tests | done (UZS convention, N4) | 02fa675 | plan example as a UZS test (600,000 UZS = USD 50 at 12,000), UZS identity, VAT excluded |
| T5.2 COGS conversion / line profit | partly: N4 | 02fa675 | storage kept in UZS (N4). Fixed the ADR 0008 recalibration: additional-expense post/cancel set profit to totalPrice − COGS (VAT included, USD amount minus UZS COGS); now net of VAT in UZS like posting |
| T5.3 summaries by currency | verified | — | no profit is labelled USD: sales summary/analytics return [{UZS}], customer profile and dashboard label UZS |
| T5.4 checks | done | — | backend checks green; frontend unchanged |
| Fresh-DB check | done | — | new empty local DB sklad_round4: all migrations applied, re-run "No pending", migrate diff "No difference" |
| P3 production page on TanStack Query | done | 5624300 | the only simple page left on the old pattern (hidden by a disable comment): one query per list, filters in the documents endpoint, debounced search, LoadError + retry, writes invalidate /production; component test (each list once, search reloads only documents, error/retry) |
| P3 purchase-return modal language switch | done | 65035eb | rows were rebuilt (quantities and VAT reset) on every locale or receipt-object change; now only typed values are state, rows derive from the receipt, another receipt starts from zero; component test (language switch, same-receipt reload, another receipt + cap); lint 39 → 37 |
| e2e hang (final run) | done | 092087a | pg Pool, Redis socket and in-memory fallback timers outlived app.close(); fixed with tests, see "e2e hang" below |

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

- F9 (found in T3.3) SalesOrdersService.update releases reservations,
  deletes the order lines and updates the order as separate statements, not
  in one transaction: a failure after deleteMany leaves an order without
  lines. Not in the plan (T4 makes invoice drafts atomic); left as a finding.

## Needs owner decision (round 4)

- N1 (F5) Transfer receipt date. The transfer has one document date
  (`transferDate`); the receipt is a separate event recorded as
  `receivedAt`, which the service sets to the moment of receiving. Dating
  the receipt by `transferDate` would collapse the in-transit account 2920
  and refuse receipts of goods shipped in a now-closed month, so the
  receipt is dated by `receivedAt` (effectively "now"). Alternative: let
  the user enter a receipt date on the receive action.
- N2 (plan T2.2, conflict with ADR 0022) The plan says "initialize new
  document currency with useDefaultCurrency()". That hook falls back to
  USD when the tenant has no default, a silent fallback ADR 0022 forbids.
  Followed the ADR: sales order/invoice forms start from
  settings.sales.defaultCurrency or blank (the forms already refuse to
  save without a currency). Owner: confirm, or set a sales default for
  every tenant.
- N3 (plan T4.2, conflict with CLAUDE.md permission rule) The plan guards
  PATCH /sales/invoices/:id with sales:create. The route uses sales:edit
  (CLAUDE.md: edit/lifecycle actions are <module>:edit; permission-catalog
  contract test). Kept sales:edit. The plan also says the body is
  Partial<CreateSalesInvoiceDto>; the route takes the full DTO (the form
  always sends the whole document; a partial body would silently merge
  missing fields). Owner: confirm.
- N4 (plan T5, conflict with ADR 0023 and the stored data) The plan stores
  gross profit in the document currency (USD profit for USD invoices).
  Since 0bce6d3 profit is stored in UZS (net revenue converted at the
  document rate minus FIFO COGS), its migration converted historical
  posted invoices to UZS, and dashboard/analytics/customer profile sum
  grossProfit across invoices and label it UZS. Switching only new rows
  would put USD and UZS amounts in one column that those reports sum
  (ADR 0023 forbids cross-currency sums); switching all rows rewrites
  posted-invoice data on Neon. Kept UZS, explicitly labelled. Owner:
  choose (a) keep UZS profit (current), or (b) document-currency profit:
  a data migration for posted invoices (grossProfit / exchangeRate for
  USD) plus per-currency grouping in every report.

## Round 4 final verification (at 092087a)

- Backend: unit 53 suites / 539 tests; typecheck exit 0; eslint (no --fix)
  exit 0; nest build exit 0; integration 17 suites / 46 tests (local sklad_test + Redis db 15);
  e2e 2 suites / 4 tests, run alone, exits by itself in 10 s without
  --forceExit (also passes with --runInBand --forceExit).
- Frontend: node tests 131/131; component tests 51 files / 130 tests; tsc
  exit 0; eslint 37 problems (30 set-state-in-effect, 7 exhaustive-deps, all
  in the click-through forms; was 39 at the start of round 4); next build
  exit 0.
- Migrations: 20261113000300 and 20261113000400 applied to local Docker
  databases only (sklad_test via migrate deploy; fresh sklad_round4 built
  from empty, re-run clean, migrate diff "No difference"). Nothing applied
  to Neon.
- Git: 20 local commits on refactor/quality-audit (not pushed); all
  changed files LF; no secrets in the diff; untracked: .claude/,
  muammolar.pdf (owner's).

## e2e hang (found in the final run)

The first final e2e run never exited (tests passed, process alive for 30+
min). --detectOpenHandles reported nothing (native sockets/timers), so a
temporary probe listed process handles and active resources after each
suite's app.close(). Three keepers, each fixed with a test:

1. Postgres: PrismaService creates its own pg Pool for the driver adapter;
   $disconnect() does not end a caller-created pool. onModuleDestroy now
   ends it once (prisma.service.int-spec).
2. Redis socket: the throttler storage was built inside the ThrottlerModule
   options, not as a provider, so Nest never ran its shutdown hook. It is
   now a provider (RATE_LIMIT_STORAGE) injected into ThrottlerModule
   (rate-limit-shutdown.int-spec on a real Redis). With REDIS_URL=localhost
   the client resolves ::1, where Docker Desktop accepts TCP but never
   answers: the client stayed in 'connect', QUIT timed out and disconnect()
   only half-closed the socket. Shutdown now destroys a socket left open
   and runs once although Nest calls it twice (two tokens)
   (throttler-storage.spec).
3. Timers (the actual 30+ min hang): with Redis unreachable every hit is
   counted in the in-memory fallback, which sets a timer per hit for the
   throttler TTL, 1 hour for sign-up. The fallback is not a provider
   either; the storage's shutdown now shuts it down (throttler-storage.spec,
   fake timers).

The same keepers would delay a production shutdown/redeploy by up to an
hour whenever Redis is unreachable.

## Round 4 NOT RUN / left for the owner

- Local backend/.env REDIS_URL uses localhost, which resolves to ::1 and
  never answers under Docker Desktop, so local runs count rate limits in
  memory. Not changed (env is out of scope): set it to
  redis://127.0.0.1:6379 yourself.

- Not pushed, merged or deployed (hard stop).
- Migrations 20261113000300 and 20261113000400 not applied to Neon:
  checklist "Migrations to apply to Neon", in that order, after a backup.
- No manual click-through or visual check of the changed screens (product
  drawer, sales order/invoice currency start, return modal, returns page,
  production page, super-admin MRR card); covered by component tests only.
- Historical data not rewritten: journal entries dated at posting time
  (checklist item for the accountant), cent drift on already posted partial
  shipments/returns, gross profit of invoices recalibrated by additional
  expenses before 02fa675 (still VAT-inclusive/unconverted; a recompute
  script would be needed, owner decision).
- Owner decisions N1-N4 above; findings F8 (useDefaultCurrency USD
  fallback outside sales), F9 (order draft update not atomic).
- Not migrated (modals/forms, outside the simple-page scope): the 14
  click-through forms left in the round 3 table, plus QuickPaymentModal,
  AllocateExpenseModal, PurchaseReturnDocumentForm, PaySalesInvoiceModal,
  PaySalesOrderModal, CreateWarehouseDrawer (fetch in effects, not flagged
  by lint); production page preview request still in an effect.
- Local leftovers (disposable): Docker databases sklad_test, sklad_demo,
  sklad_round3, sklad_round4; containers sklad_postgres, sklad_redis.

# Round 5 (2026-11-13): F8 currency guesses, F9 atomic edits

Scope: code only; no push/merge/deploy, no Neon, no env/secrets. Owner
decisions kept as they were: N1 open (accountant), N2 and N3 accepted as
implemented, N4 stays UZS.

## Part 1: F8, silent currency guesses

Line numbers are as at the start of round 5 (a86affd). "Writes" = the guess
could end up in a created/changed document, price, payment or stored amount.

### Fixed (the guess could be stored, or labelled a wrong-currency total)

| file:line (a86affd) | what happened when the currency was missing | decision / commit |
|---|---|---|
| components/products/CreateProductDrawer.tsx:75, :124, :133, :282 | cost-price currency preselected UZS (also on reset, and on edit when unset); a USD cost saved untouched was stored as UZS; an edited USD cost without rate assumed 1 | needs explicit choice: starts blank, nonzero cost refuses to save ("Xarid tannarxi valyutasini tanlang" / "Укажите валюту себестоимости") — a333b31 |
| app/.../products/new/page.tsx:45 | same (UZS preselected) | needs explicit choice — a333b31 |
| components/purchases/QuickAddProductModal.tsx:50 | same (UZS preselected) | needs explicit choice — a333b31 |
| components/purchases/PurchaseDocumentForm.tsx:201-203, :300-302, :342-344 | picking a product with no document currency yet prefilled its cost as a UZS price (`currency \|\| 'UZS'`, `costPriceCurrency \|\| 'UZS'`, rate `\|\| 1`); the number stayed when the user then chose USD and was saved as a USD price | price left empty until the document and cost currencies and needed rates are known (`documentUnitPriceFromProductCost`); submit already required a currency — 5d62738 |
| app/.../opening-balances/page.tsx:556 (addLine), :1868, :2020, :2179 (selects), :1652 (badge `\|\| 'USD'`), :1892 | every new line was UZS; a USD debt/stock line saved untouched was stored as UZS; selects showed UZS for a blank line | cash, inventory, debt and advance lines start blank; save and post list the rows without a currency ("Har bir qatorda valyutani tanlang (qatorlar: …)" / "Выберите валюту в каждой строке (строки: …)") — 9c7d2f6 |
| app/.../finance/page.tsx:1602, :1612, body `fromAccount ? fromAccount.currency : currency` | income/expense form started from useDefaultCurrency() (USD when unset); with no resolved account the guess could be sent | currency = settlement or chosen cash account; submit requires the account and always sends its currency — d2027f0 |
| app/.../sales/prices/page.tsx:75 | price-list edit state initialised from the guessing hook (overwritten on open; dead guess) | starts '' — d2027f0 |
| backend dto/create-purchase-expense.dto.ts:34-36 | `currency` optional → `purchase_expenses.currency` DB default UZS | required, `@IsValidCurrency()`; the only caller (AllocateExpenseModal) already sends it — bdb7332 |
| backend additional-expenses.service.ts:499 + app/.../purchases/expenses/page.tsx:183 | KPI totals summed USD and UZS and were labelled with the first expense's currency, or 'USD' (backend) / tenant default (frontend) | one amount per currency (`stats.transport/customs/broker/all: [{currency, amount}]`), a dash when none — 4ead0b9. API shape change of `GET /purchases/additional-expenses` (only consumer is that page) |
| app/.../inventory/page.tsx:317, :395; app/.../products/page.tsx:497, :601 | a legacy sale price without a currency (nullable) was labelled with the tenant default (USD when unset) | `formatPriceOrUnset`: number + "(valyuta tanlanmagan / валюта не выбрана)" — f5b2b3b |
| app/.../products/page.tsx:425 | margin compared cost vs `salePriceCurrency \|\| default` | margin only when both currencies are set and equal — f5b2b3b |
| app/.../accounting/journal/page.tsx:89 | journal lines have no currency column; amounts (always UZS, ADR 0006) were labelled with the tenant default | `LEDGER_CURRENCY` ('UZS', defined, not a fallback) — f5b2b3b |

### Left on purpose (display only)

Listed with a reason in `frontend/src/lib/currency-guess-scan.spec.ts`
(per-file count; a new match or a stale entry fails the scan).

| file (current) | why it can stay |
|---|---|
| hooks/useDefaultCurrency.ts | the hook itself, now documented DISPLAY ONLY |
| accounting/page.tsx (5), accounting/reports/page.tsx (1) | OSV/statements currency is always UZS from the API (ADR 0006) |
| analytics/page.tsx (literal + hook) | KPI response always carries `currency` |
| finance/page.tsx literals (9) | `accountCurrencies` always set by the API |
| finance/page.tsx, counterparties, purchases/suppliers, sales/customers (hook); purchases/page, sales/page, app/[locale]/page.tsx (literals) | fallback label of a zero amount in MultiCurrencyValue when there is no row in any currency; dashboard chart currency pick |
| inventory/page, products/page `costPriceCurrency \|\| 'UZS'`; SalesInvoiceForm:259 | `products.cost_price_currency` is NOT NULL |
| purchases/expenses/new (8), expenses/page (2), expenses/[id] (5) | receipt/expense `currency` columns are NOT NULL |
| sales/prices (hook) | selected price list's currency (NOT NULL) |
| sales/returns (hook) | rendered only with a selected invoice |
| OrderDeliveryNoteModal:66 | `sales_orders.currency` NOT NULL (print view) |
| lib/opening-balance-lines.ts `currency: 'UZS'` | fixed-asset register is UZS (D6), defined |
| opening-balances `docCurrency = 'UZS'`, equity/fixed-asset new lines | document totals and those tables are in the UZS base currency (no choice offered) |
| purchases/returns, services, sales/crm (hook), SupplierProfileDrawer:88 | display only, but **finding F10** below |
| backend products.service.ts:68 `costPriceCurrency ?? 'UZS'` | only for a zero cost (a nonzero cost without currency is refused above it) |
| backend billing/super-admin subscriptions `currency: 'UZS'` | plan prices are defined in UZS |
| backend `@default("UZS")` columns | every create DTO requires the currency (`@IsValidCurrency()`) after bdb7332; update DTOs keep the stored value |

Tests: component (CreateProductDrawer: blank start, blank blocks submit,
chosen submits; expenses page per-currency KPIs), node specs
(documentUnitPriceFromProductCost, newOpeningBalanceLine /
linesMissingCurrency, formatPriceOrUnset), backend (purchase-expense DTO,
expense stats), scan test (5420680). Each new test was run red first.

## Part 2: F9, editing a sales order

### Writes before the fix (SalesOrdersService.update, a86affd), in order

1. read order + items (no lock), status check NEW/PENDING_APPROVAL
2. warehouse/tenant ownership checks; currency/rate checks
3. read products, compute totals from `dto.items` or the stale `order.items`
4. `releaseOrderReservations` (own statements: stock_levels.reserved_quantity
   decrement, delete stock_reservations, reset item reservedQty)
5. `salesOrderItem.deleteMany`
6. `salesOrder.update` (header, totals, nested create of new items)
7. warehouse check (`Buyurtma uchun ombor tanlanishi shart`) — after 4-6
8. `reserveStockForOrder` (per line: create reservation, upsert
   stock_levels.reserved_quantity, update item reservedQty)
9. re-read for the response

Each statement was its own implicit transaction. Reproduced on local
Postgres (`sales-order-edit.int-spec.ts`, 4 of 6 red on the old code):
injected failure in step 8 left new lines without reservations; an order
without a warehouse lost its lines; an approval committed after step 1 was
edited anyway; two concurrent edits left two line sets, both reserved.

### Fix (2ad75ed)

Status pre-check stays for a fast clear error; then ONE `$transaction`
(PrismaService default `timeout: 30_000`, the posting setting):
`SELECT status FROM sales_orders WHERE id AND tenant_id FOR UPDATE` (as T4),
re-check editable, read order+items under the lock, validate
currency/rate and warehouse **before** any write, release reservations,
delete lines, update order + create lines, reserve stock — all with `tx`.
Tenant filter on every query. Period closing: the order edit path has no
period check (orders post nothing to the ledger), so there was none to
keep and none was added. Tests: success result unchanged (totals,
reservations, stock level == sum of reservations), rollback on injected
failure, warehouse missing → nothing changed, approval committed meanwhile
→ refused, two concurrent edits → both succeed in sequence, consistent,
other tenant → 404 unchanged; unit spec mock got `$queryRaw`.

### Other document edit paths (step 5)

| path | state before | action |
|---|---|---|
| SalesInvoicesService.updateInvoice (draft) | one tx + FOR UPDATE + re-check (T4) | none |
| PurchasesService.updateReceipt (draft) | one tx, status checked before it, no lock | **fixed** 26f4b8f (lockDocumentStatus + re-check) |
| AdditionalExpensesService.updateDraft | same | **fixed** 26f4b8f |
| ServicesService.update (draft act) | same | **fixed** 26f4b8f |
| OpeningBalancesService.updateLines | same (refuses POSTED) | **fixed** 26f4b8f |
| ProductionService.updateActualMaterials | one tx, status read inside it but no row lock | finding F13 |
| FinanceService.updateTransaction | single statement (comment/type only) | none |
| purchase returns, sales returns, transfers, inventory documents | no edit route (create / post / cancel only) | none |
| SalesOrdersService.create | order create, audit log and reservations are separate statements | finding F12 (create, not edit) |

`document-edit-lock.int-spec.ts` posts each document just before the edit's
transaction starts (4 of 7 red on the old code), plus lock ordering and
other-tenant lookup of the helper.

## Round 5 findings (not changed)

- F10 Cross-currency totals labelled with one currency (ADR 0023, display):
  purchase returns page totals (`returns[0].currency`), services page KPIs
  (`acts[0].currency`), CRM column totals (tenant default), customer
  profile totals, SupplierProfileDrawer KPIs (backend supplier metrics sum
  receipts/payments across currencies). Fix like the additional-expense
  KPIs (one amount per currency).
- F11 Legacy `POST /purchases/expenses` (PurchaseExpense): allocation sums
  all expenses of a receipt across currencies with no exchange rate, and
  allocates them on receipt prices in the receipt currency. Now at least
  the currency is explicit (bdb7332).
- F12 SalesOrdersService.create is not one transaction (order, audit log,
  reservations).
- F13 ProductionService.updateActualMaterials reads the status inside its
  transaction without FOR UPDATE.
- F14 Post paths (receipt, expense, act, opening balance, invoice) do not
  lock the document row before reading its lines; an edit holding the new
  lock while a post runs can still let the post read the old lines. Lock at
  the start of each post (same helper).
- F15 Opening-balance import, sheet 2_Tovar has no currency column; costs
  are stored as UZS by the template's definition, but the header does not
  say so ("Birlik tannarxi"). Suggest "(UZS)" in the header or a currency
  column.

## Part 3

- No new migration in round 5 (API/DTO and code only).
- Checklist: added the API contract changes (purchase expense currency
  required; additional-expense stats shape).

## Round 6: money in/out (Finance) audit, 2026-11-14

Owner report: "issue in transaction/money in/out UI and logic", then
"check full project". Audit of the Finance page, FinanceService and the
cash paths in sales payments, purchase payments, additional expenses,
services and opening balances.

| Commit | What |
|---|---|
| e3556e9 | Locked-row balance re-check (no negative tills under concurrency) in Finance expense/transfer/reversals, purchase payment, additional-expense payment; Payment journal removed on storno; sales-order payment gate re-closed on storno; additional-expense FIFO open amount net of earlier payments; cancelled/deleted transactions no longer block service act / additional expense / purchase return cancel or count in supplier totals; Finance drawer lists every valid account (was locked to the first account's currency), exchange mode targets the other currency, linked-document overpayment caught, formatted balance message |
| 2d465c2 | Finance income/expense/transfer post journal entries (ADR 0006 section added): cash vs 4010 / 6010 / new 9390 / 9430, FX difference at document rate to 9540 / 9620; deleted on cancel; purchase payments keyed by FinanceTransaction; paid-at-posting additional expense reversed only by cancelling the expense; expense cancel blocked by FIFO allocations |
| 30b36d4 | `npm run finance:backfill-journal -- --tenant <id> (--dry-run \| --apply)` for pre-existing transactions; Finance refuses to cancel opening-balance cash (unposting the document reverses it) |

NOT RUN: the backfill against any database (only unit-tested; the owner
runs `--dry-run` first on Neon); `purchase-invariant.int-spec.ts` (changed
for the new purchase-payment journal key) needs `DATABASE_URL_TEST`; no
browser click-through.

Left open: legacy purchase payments (journal keyed `PurchasePayment` /
receipt id) still keep their entry if cancelled from Finance; a cancelled
customer Payment stays listed under Payments (no status column); dashboard
"today" uses the server clock, not Asia/Tashkent.
