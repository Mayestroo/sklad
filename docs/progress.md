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
- [ ] P4.4 pluggable throttler storage (D5, REDIS_URL)
- [ ] P4.5 registration enumeration (D3)
- [ ] P4.6 B13 reading + B6 opening-balance labelling
- [ ] P4.7 D2 purchase-return gap account setting
- [ ] P5 react-hooks: shared data-loading + page migration
- [ ] P6 visual verification on local Docker DB
- [ ] P7 final verification, review, git hygiene

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
  and files (`\` -> `\`); scripts use chr(92) / String.fromCharCode.

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
  suites / 35 tests (new accounting-periods.int-spec 5/5); e2e 1/2 tests
  pass (2/2); typecheck clean; eslint on changed files clean; nest build
  OK. Guards: 17 lifecycle checks + journal-writer scan fail on the old
  services (git stash); A1 test fails on the old sales service.
