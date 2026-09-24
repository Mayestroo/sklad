# Counterparty Settlement Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make counterparty balances correct, auditable, rebuildable, and segregated by currency across sales, purchases, finance, services, and opening balances.

**Architecture:** Add an append-only settlement ledger and explicit payment allocations behind one NestJS settlement module. In the originating Prisma transaction, the module writes the immutable movement and updates `CounterpartyBalance`, which becomes a rebuildable read projection. Migrate every debt-writing module to that boundary, backfill history without guessing missing currency/side, and switch all debt readers to per-currency data.

**Tech Stack:** TypeScript, NestJS 11, Prisma 7, PostgreSQL, Jest, React 19, Next.js 16.

## Execution Status (2026-09-24)

- Tasks 1–5 and 7 are implemented; settlement source tests, projection/API tests, backend build, Prisma validation, frontend tests, and frontend production build pass.
- Task 6 reconciliation implementation and unit tests pass. Database-backed `--dry-run`/`--apply` verification remains pending because the workspace `.env` points to a remote database and no test tenant/target was designated.
- The full backend run passes when the database-backed `purchase-invariant.spec.ts` is excluded (22 suites, 216 tests). That integration suite timed out while connecting through the configured remote database.
- Targeted lint passes for `QuickPaymentModal`; linting the larger changed pages still reports existing `no-explicit-any` and React effect-rule violations.

## Global Constraints

- Supported settlement currencies are exactly `USD` and `UZS`; every entry and allocation keeps its native currency.
- Customer-side and supplier-side movements are separate signed balances; no movement may net a sales invoice against a purchase receipt implicitly.
- `CounterpartySettlementEntry` and allocation history are append-only. Corrections and rollbacks append inverse records.
- Ledger, allocation, document paid amount/status, accounting journal, and `CounterpartyBalance` projection changes commit in one database transaction.
- Unlinked finance settlements require explicit `settlementSide`; transaction direction or counterparty type alone never guesses the side.
- Historical currency or settlement-side gaps are explicit reconciliation exceptions, never silent defaults.
- Keep price-list data used by historical documents; this plan does not delete the price-list domain.

---

## File Map

### New settlement domain

- `backend/src/modules/settlements/settlements.module.ts` — exports the shared settlement service to debt-writing feature modules.
- `backend/src/modules/settlements/counterparty-settlement.service.ts` — validates, idempotently appends movements, updates the currency projection, rebuilds balances, and posts/reverses allocations.
- `backend/src/modules/settlements/counterparty-settlement.service.spec.ts` — unit tests for movement sign, currency validation, idempotency, reversal, and projection writes.
- `backend/src/modules/settlements/settlement-allocation.service.spec.ts` — allocation boundary, FIFO, and advance tests.
- `backend/src/modules/settlements/reconciliation.service.ts` — constructs legacy movements, performs dry-run/apply backfill, rebuilds projections, and reports unreconstructable balances.
- `backend/src/modules/settlements/reconciliation.service.spec.ts` — deterministic backfill and exception-report tests.
- `backend/scripts/reconcile-counterparty-settlement.ts` — explicit `--dry-run` / `--apply` entry point.

### Schema and module wiring

- `backend/prisma/schema.prisma` — settlement-side enum, ledger/allocation models, Finance transaction side, and relations.
- `backend/prisma/migrations/20260924000100_counterparty_settlement_ledger/migration.sql` — additive PostgreSQL schema migration and constraints.
- `backend/src/app.module.ts` — register/import the settlement module if it is not provided only through feature modules.
- `backend/src/modules/sales/sales.module.ts`, `backend/src/modules/finance/finance.module.ts`, `backend/src/modules/purchases/purchases.module.ts`, `backend/src/modules/services/services.module.ts`, `backend/src/modules/opening-balances/opening-balances.module.ts` — import the shared module.
- `shared/types/sales.ts`, `shared/types/finance.ts` — currency balance and finance settlement-side contracts.

### Existing debt writers

- `backend/src/modules/sales/invoices/sales-invoices.service.ts` and `.spec.ts` — invoice and return posting/reversal.
- `backend/src/modules/sales/orders/sales-orders.service.ts` and `.spec.ts` — order payment and dispatch settlement.
- `backend/src/modules/sales/payments/payments.service.ts` — registered invoice/order payment settlement.
- `backend/src/modules/purchases/purchases.service.ts` and purchase test files — receipt, receipt payment, purchase return, and return cancellation.
- `backend/src/modules/purchases/additional-expenses.service.ts` and `.unit.spec.ts` — unpaid expense payable and paid-expense no-payable behavior.
- `backend/src/modules/services/services.service.ts` and `.spec.ts` — service act posting, unposting, cancellation, and settlement.
- `backend/src/modules/opening-balances/opening-balances.service.ts` and `.spec.ts` — debt and advance opening-balance lines.
- `backend/src/modules/finance/dto/create-income.dto.ts`, `create-expense.dto.ts`, `finance.service.ts`, `finance.controller.ts`, and `finance-settlement.spec.ts` — explicit side on generic counterparty settlement.

### Read APIs and user interface

- `backend/src/modules/sales/counterparties/counterparties.service.ts` and `.spec.ts` — per-currency balances, summary, statement, and legacy scalar removal.
- `backend/src/modules/analytics/analytics.service.ts` — debt summaries from currency projections.
- `backend/src/modules/dashboard/dashboard.service.ts` — debtor/creditor values by currency.
- `backend/src/modules/sales/invoices/sales-invoices.service.ts` — sales summary debt sourced from the ledger projection.
- `frontend/src/app/[locale]/(dashboard)/counterparties/page.tsx` — show currency-specific gross positions and side-specific actions.
- `frontend/src/components/counterparties/QuickPaymentModal.tsx` — accept side and currency, restrict account currency, and show the selected balance.
- `frontend/src/app/[locale]/(dashboard)/finance/page.tsx` — settlement-side selector for unlinked counterparty transactions and currency-specific debt summary.

---

### Task 1: Add the ledger schema and atomic movement service

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260924000100_counterparty_settlement_ledger/migration.sql`
- Create: `backend/src/modules/settlements/counterparty-settlement.service.ts`
- Create: `backend/src/modules/settlements/settlements.module.ts`
- Create: `backend/src/modules/settlements/counterparty-settlement.service.spec.ts`

**Interfaces:**
- Produces `SettlementSide = 'CUSTOMER' | 'SUPPLIER'` and `recordMovement(tx, input)`, where `input` contains `tenantId`, `counterpartyId`, `currency`, `side`, signed `amount`, `entryType`, `effectiveAt`, `sourceDocType`, `sourceDocId`, optional `sourceLineId`, and unique `idempotencyKey`.
- `recordMovement` returns `{ entry, balance, created }`; `created` is false for an identical already-recorded event and never increments the projection a second time.

- [ ] **Step 1: Add failing movement tests**

Test: positive customer movements increment only customer debt; negative supplier movements decrement only supplier debt; a USD movement cannot affect a UZS projection; invalid currency, zero amount, and missing idempotency key reject.

```ts
it('increments only the selected side and currency', async () => {
  await service.recordMovement(tx, movement({ side: 'CUSTOMER', currency: 'USD', amount: 125 }));
  expect(tx.counterpartyBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { counterpartyId_currency: { counterpartyId: 'cp-1', currency: 'USD' } },
    create: expect.objectContaining({ customerDebt: 125, supplierDebt: 0 }),
    update: { customerDebt: { increment: 125 } },
  }));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/counterparty-settlement.service.spec.ts`
Expected: FAIL because the settlement service and models do not exist yet.

- [ ] **Step 3: Add Prisma models and PostgreSQL constraints**

Add `CounterpartySettlementSide`, `CounterpartySettlementEntry`, and `SettlementAllocation`. Store signed `DECIMAL(15,2)` native-currency movements, a unique idempotency key, source identifiers, reversal links, timestamps, and tenant/counterparty relations. Add nullable `FinanceTransaction.settlementSide`. Give allocations a finance transaction source, target type/ID, currency, side, signed amount, unique idempotency key, and reversal link. Add indexes for tenant/counterparty/currency/date and source lookup. Keep polymorphic source/target IDs validated by the settlement service.

Generate the additive SQL migration with the repository's Prisma workflow; include unique/check constraints for idempotency, supported-side values, and non-zero movement/allocation amounts.

- [ ] **Step 4: Implement `recordMovement` with idempotent projection update**

Use `createMany({ data: [entry], skipDuplicates: true })` on the active `Prisma.TransactionClient`. When one row is created, upsert `CounterpartyBalance` for exactly that counterparty/currency and increment only the selected side. When the idempotency key already exists, load the entry, compare all immutable event fields, return `{ created: false }` if equal, and throw `ConflictException` if the same key describes a different event. Validate tenant-owned counterparty, `SUPPORTED_CURRENCIES`, finite non-zero amount, and required event identity before writing.

- [ ] **Step 5: Run movement tests and Prisma validation**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/counterparty-settlement.service.spec.ts` and `npx prisma validate`.
Expected: focused tests PASS and Prisma schema reports valid.

### Task 2: Implement allocation, reversal, and projection rebuild operations

**Files:**
- Modify: `backend/src/modules/settlements/counterparty-settlement.service.ts`
- Modify: `backend/src/modules/settlements/counterparty-settlement.service.spec.ts`
- Create: `backend/src/modules/settlements/settlement-allocation.service.spec.ts`

**Interfaces:**
- `recordAllocation(tx, { tenantId, counterpartyId, currency, side, financeTransactionId, targetType, targetId, amount, idempotencyKey })` stores a positive allocation after validating source and target.
- `reverseAllocation(tx, { allocationId, idempotencyKey })` appends an equal negative allocation linked to the original; it does not edit the original row.
- `rebuildBalances(tx, tenantId)` aggregates ledger entries and replaces that tenant's `CounterpartyBalance` projection.

- [ ] **Step 1: Write failing allocation tests**

Cover same-currency/customer validation, wrong-counterparty rejection, over-allocation rejection, idempotent duplicate allocation, FIFO partial allocation, unapplied advances, and order-prepayment reallocation to a dispatch invoice.

- [ ] **Step 2: Run focused tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/settlement-allocation.service.spec.ts`.
Expected: FAIL before allocation/reversal methods are implemented.

- [ ] **Step 3: Implement allocation validation and reversals**

Load the Finance transaction, verify tenant/counterparty/currency/side and unapplied amount, load the typed target (`SALES_INVOICE`, `SALES_ORDER`, `SALES_RETURN`, `PURCHASE_RECEIPT`, `PURCHASE_RETURN`, `ADDITIONAL_EXPENSE`, or `SERVICE_ACT`), verify target tenant/counterparty/currency/status, and enforce the target open amount. Maintain document `paidAmount`/payment status in the caller's same transaction. For pre-dispatch order payments, reverse the order allocation and append an invoice allocation during dispatch without posting another ledger movement.

- [ ] **Step 4: Implement deterministic balance rebuild**

Aggregate `CounterpartySettlementEntry` grouped by tenant, counterparty, currency, and side. Delete/recreate only the selected tenant's projection rows in the passed transaction; preserve zero-valued currency rows only when required by the existing API contract. Return the exact group totals for reconciliation.

- [ ] **Step 5: Run allocation and projection tests**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/counterparty-settlement.service.spec.ts src/modules/settlements/settlement-allocation.service.spec.ts`.
Expected: all movement, allocation, reversal, and rebuild tests PASS.

### Task 3: Route sales invoices, returns, orders, and payments through the ledger

**Files:**
- Modify: `backend/src/modules/sales/sales.module.ts`
- Modify: `backend/src/modules/sales/invoices/sales-invoices.service.ts`
- Modify: `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts`
- Modify: `backend/src/modules/sales/orders/sales-orders.service.ts`
- Modify: `backend/src/modules/sales/orders/sales-orders.service.spec.ts`
- Modify: `backend/src/modules/sales/payments/payments.service.ts`

**Interfaces:**
- Sales writers call `CounterpartySettlementService.recordMovement` with `side: 'CUSTOMER'` and source type/ID; payment writers also call allocation/reversal APIs.

- [ ] **Step 1: Add failing sales movement regression tests**

Assert invoice post creates one positive customer movement in invoice currency; invoice unpost adds the inverse; sales return creates a negative movement including VAT; repeated post cannot duplicate a movement; order prepayment followed by partial dispatch leaves the correct remaining customer balance and one cash movement.

- [ ] **Step 2: Run the focused sales tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/sales/invoices/sales-invoices.service.spec.ts src/modules/sales/orders/sales-orders.service.spec.ts`.
Expected: new settlement assertions fail against existing direct scalar/projection mutations.

- [ ] **Step 3: Replace direct debt writes in invoice and return paths**

Inject the shared service in `SalesModule`. In `postInvoice`, append a positive `CUSTOMER` movement for `invoice.totalAmount`; in `unpostInvoice`, append the inverse with the reversal key. In `executePostReturn`, append the negative return movement using `params.totalAmount` (which includes proportional VAT). Remove the matching direct `counterparty.update` and `counterpartyBalance.upsert` operations.

- [ ] **Step 4: Replace order dispatch and registered payment writes**

In `SalesOrdersService.dispatch`, append the invoice receivable movement once and allocate existing order payments to the new invoice without a second ledger movement. In `PaymentsService.registerPayment`, persist `settlementSide: 'CUSTOMER'`, append one negative ledger movement from the actual Finance transaction, and allocate to the invoice/order. Remove its independent `debtBalance` and `CounterpartyBalance` mutations.

- [ ] **Step 5: Run focused sales tests**

Run from `backend`: `npm test -- --runInBand src/modules/sales/invoices/sales-invoices.service.spec.ts src/modules/sales/orders/sales-orders.service.spec.ts`.
Expected: sales document and settlement tests PASS.

### Task 4: Route purchase, service-act, and opening-balance writers through the ledger

**Files:**
- Modify: `backend/src/modules/purchases/purchases.module.ts`
- Modify: `backend/src/modules/purchases/purchases.service.ts`
- Modify: `backend/src/modules/purchases/purchases.service.unit.spec.ts`
- Modify: `backend/src/modules/purchases/purchase-returns.spec.ts`
- Modify: `backend/src/modules/purchases/additional-expenses.service.ts`
- Modify: `backend/src/modules/purchases/additional-expenses.service.unit.spec.ts`
- Modify: `backend/src/modules/services/services.module.ts`
- Modify: `backend/src/modules/services/services.service.ts`
- Modify: `backend/src/modules/services/services.service.spec.ts`
- Modify: `backend/src/modules/opening-balances/opening-balances.module.ts`
- Modify: `backend/src/modules/opening-balances/opening-balances.service.ts`
- Modify: `backend/src/modules/opening-balances/opening-balances.service.spec.ts`

**Interfaces:**
- Purchase, received-service, and supplier opening movements use `side: 'SUPPLIER'`; provided-service and customer opening movements use `side: 'CUSTOMER'`.
- Advance opening lines use a negative signed movement on their respective side.

- [ ] **Step 1: Add failing tests for omitted currency movements**

Add focused cases for purchase-receipt post/unpost, purchase-return post/cancel, direct purchase payment, unpaid/paid additional expense, service-act post/unpost, and all four counterparty opening categories (`CUSTOMER_DEBT`, `CUSTOMER_ADVANCE`, `SUPPLIER_DEBT`, `SUPPLIER_ADVANCE`). Assert each movement's side, currency, signed amount, and reversal source.

- [ ] **Step 2: Run relevant backend tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/purchases/purchases.service.unit.spec.ts src/modules/purchases/purchase-returns.spec.ts src/modules/purchases/additional-expenses.service.unit.spec.ts src/modules/services/services.service.spec.ts src/modules/opening-balances/opening-balances.service.spec.ts`.
Expected: new ledger expectations fail before writers are migrated.

- [ ] **Step 3: Migrate purchase and additional-expense writes**

Use `CounterpartySettlementService` inside the existing purchase transactions. Post receipt as positive supplier movement; post a purchase return as its signed supplier movement; reverse it on cancellation/unpost. Record an unpaid additional purchase expense as a positive supplier movement. Mark an immediately paid expense's Finance transaction as no settlement effect. Remove direct debt scalar/projection writes for each migrated event.

- [ ] **Step 4: Migrate service-act and opening-balance writes**

Post `PROVIDED` service acts as positive customer movements and `RECEIVED` acts as positive supplier movements. Route cancel/unpost through linked inverse entries after existing rollback checks pass. Map opening debt lines to positive entries and advance lines to negative entries using the line currency. Keep cash-account opening balances separate from counterparty movements.

- [ ] **Step 5: Run focused purchase, service, and opening tests**

Run from `backend`: `npm test -- --runInBand src/modules/purchases/purchases.service.unit.spec.ts src/modules/purchases/purchase-returns.spec.ts src/modules/purchases/additional-expenses.service.unit.spec.ts src/modules/services/services.service.spec.ts src/modules/opening-balances/opening-balances.service.spec.ts`.
Expected: all migrated source events and reversals PASS.

### Task 5: Require explicit settlement side for generic Finance activity

**Files:**
- Modify: `backend/src/modules/finance/dto/create-income.dto.ts`
- Modify: `backend/src/modules/finance/dto/create-expense.dto.ts`
- Modify: `backend/src/modules/finance/finance.service.ts`
- Modify: `backend/src/modules/finance/finance-settlement.spec.ts`
- Modify: `frontend/src/app/[locale]/(dashboard)/finance/page.tsx`
- Modify: `frontend/src/components/counterparties/QuickPaymentModal.tsx`

**Interfaces:**
- Add optional `settlementSide?: 'CUSTOMER' | 'SUPPLIER'` to income/expense transaction DTOs. It is required by service validation when the transaction has a counterparty, is unlinked to a typed settlement document, and changes a receivable/payable.
- Source-linked operations derive the side from the source document; paid additional expenses set no settlement side.

- [ ] **Step 1: Add failing Finance side-classification tests**

Test customer receipt, customer refund, supplier payout, supplier refund, `BOTH` counterparty with missing side, source-linked transaction side derivation, and paid-expense no-effect behavior. Assert the Finance transaction stores the side and ledger movements use the correct sign.

- [ ] **Step 2: Run Finance settlement tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/finance/finance-settlement.spec.ts`.
Expected: new tests fail while Finance still infers customer/supplier from income/expense direction.

- [ ] **Step 3: Validate and persist Finance settlement side**

In `FinanceService.createIncome` and `createExpense`, resolve the side from a typed source or require `dto.settlementSide`; validate linked counterparty, source, amount, and currency. Create one settlement movement from the Finance transaction and remove direct scalar/projection adjustments. Keep cash-account balance and journal postings in the same transaction.

- [ ] **Step 4: Add side selection to Finance and quick-payment UI**

Show a localized customer/supplier side selector for unlinked Finance transactions with a counterparty. In `QuickPaymentModal`, select a specific currency and one balance side; map customer receipt/refund and supplier payout/refund to the correct direction. Filter cash accounts to the selected currency and submit `settlementSide` explicitly.

- [ ] **Step 5: Run Finance tests and frontend checks**

Run from `backend`: `npm test -- --runInBand src/modules/finance/finance-settlement.spec.ts`.
Run from `frontend`: `npm test` and `npm run lint`.
Expected: focused tests and lint PASS.

### Task 6: Implement historical backfill, projection rebuild, and reconciliation

**Files:**
- Create: `backend/src/modules/settlements/reconciliation.service.ts`
- Create: `backend/src/modules/settlements/reconciliation.service.spec.ts`
- Create: `backend/scripts/reconcile-counterparty-settlement.ts`
- Modify: `backend/package.json`

**Interfaces:**
- `reconcileCounterpartyLedger(tenantId, { apply: boolean })` returns `{ entriesCreated, allocationsCreated, balanceRowsRebuilt, exceptions, differences }`.
- CLI supports exactly `--dry-run` and `--apply`, a required tenant ID, and exits non-zero if unresolved side/currency exceptions remain in apply mode.

- [ ] **Step 1: Add failing backfill fixture tests**

Cover opening debt/advance lines, posted sales and purchase documents, returns, service acts, direct and FIFO settlements, order-linked payments, paid/unpaid additional expenses, duplicate payment metadata, and an orphan legacy scalar. Expected movements must be derived in each source currency; the orphan/ambiguous record must appear as an exception.

- [ ] **Step 2: Run reconciliation tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/reconciliation.service.spec.ts`.
Expected: FAIL because reconciliation service is not implemented.

- [ ] **Step 3: Implement idempotent source reconstruction**

Read posted source docs, active returns, posted finance transactions, opening-balance lines, and payment metadata. Treat linked `FinanceTransaction` as the cash source once. Use linked document type to derive side; do not guess an unlinked `BOTH` side or unknown currency. Derive allocations chronologically by source currency and document open balance; emit exceptions where existing `paidAmount` cannot be explained by source records.

- [ ] **Step 4: Implement dry-run/apply and report output**

Dry-run returns planned entries, projection differences, and exceptions without writes. Apply writes ledger entries and allocations by idempotency key, rebuilds only the selected tenant's `CounterpartyBalance`, and emits a before/after JSON report. Add `settlement:reconcile` script with explicit tenant and mode arguments.

- [ ] **Step 5: Run reconciliation and Prisma tests**

Run from `backend`: `npm test -- --runInBand src/modules/settlements/reconciliation.service.spec.ts` and `npx prisma validate`.
Run CLI against a seeded test tenant with `--dry-run`, then `--apply`, then `--dry-run` again.
Expected: first dry-run reports planned entries; apply creates no duplicate source keys; final dry-run reports zero unexplained projection differences or explicit unresolved exceptions.

### Task 7: Switch debt APIs and screens to currency projections

**Files:**
- Modify: `backend/src/modules/sales/counterparties/counterparties.service.ts`
- Modify: `backend/src/modules/sales/counterparties/counterparties.service.spec.ts`
- Modify: `backend/src/modules/analytics/analytics.service.ts`
- Modify: `backend/src/modules/dashboard/dashboard.service.ts`
- Modify: `backend/src/modules/sales/invoices/sales-invoices.service.ts`
- Modify: `frontend/src/app/[locale]/(dashboard)/counterparties/page.tsx`
- Modify: `frontend/src/app/[locale]/(dashboard)/finance/page.tsx`
- Modify: `frontend/src/components/counterparties/QuickPaymentModal.tsx`
- Modify: `shared/types/sales.ts`
- Modify: `shared/types/finance.ts`

- [ ] **Step 1: Add failing API tests for currency-separated balances**

Test a counterparty with USD receivable, UZS supplier payable, customer advance, and both sides in one currency. Assert list/detail/summary responses retain each currency and gross side; no response uses scalar `debtBalance` as a currency amount.

- [ ] **Step 2: Run counterparty tests and verify failure**

Run from `backend`: `npm test -- --runInBand src/modules/sales/counterparties/counterparties.service.spec.ts`.
Expected: assertions fail against current scalar fallbacks and incomplete projection summaries.

- [ ] **Step 3: Make backend summaries projections-only**

Change counterparties, sales, analytics, dashboard, and finance debt queries to aggregate `CounterpartyBalance` by currency and side. Return `customerDebt`, `supplierDebt`, and per-currency `netBalance`; expose separate receivable/payable and advance amounts when producing KPI summaries. Remove scalar fallbacks and avoid selecting one “recent” currency for an aggregate.

- [ ] **Step 4: Render gross positions and settlement actions per currency**

Update shared response types and the counterparties table to render each currency independently, show both gross sides and per-currency net, and launch a side/currency-specific payment. Update Finance debt KPIs to use multi-currency values and prevent selecting an account with a different currency.

- [ ] **Step 5: Run API tests and frontend checks**

Run from `backend`: `npm test -- --runInBand src/modules/sales/counterparties/counterparties.service.spec.ts`.
Run from `frontend`: `npm test`, `npm run lint`, and `npm run build`.
Expected: no type errors, cross-currency aggregate, or scalar currency fallback.

### Task 8: Cut over, verify invariants, and prepare the requested push

**Files:**
- Modify: all migrated writer/read files listed above.
- Verify: `backend/prisma/schema.prisma` and the new migration.
- Verify: `docs/superpowers/specs/2026-09-23-counterparty-settlement-ledger-design.md`.

- [ ] **Step 1: Search for remaining scalar debt writes and currency fallbacks**

Run from repo root: `rg -n "debtBalance: \{ (increment|decrement)|debtBalance \|\||debtBalance\)" backend/src frontend/src`.
Expected: no runtime writer or UI amount formatter depends on scalar `debtBalance`; any remaining compatibility read has a documented non-monetary purpose.

- [ ] **Step 2: Run the full backend test suite**

Run from `backend`: `npm test -- --runInBand`.
Expected: all tests pass; repair mocks that fail due the added Prisma delegates or transaction calls.

- [ ] **Step 3: Run frontend, schema, and build checks**

Run from `frontend`: `npm test && npm run lint && npm run build`.
Run from `backend`: `npx prisma validate && npm run build`.
Expected: all commands exit 0.

- [ ] **Step 4: Review status/diff and commit only intended changes**

Run `git status --short`, `git diff --check`, and `git diff`. Stage only the ledger implementation, tests, migration, spec, plan, and `.gitignore` companion change. Do not stage the user-provided `muammolar.pdf`.

- [ ] **Step 5: Commit and push the completed branch**

Create a concise commit in the repository's conventional style, then push the current branch to its configured upstream. Confirm the pushed commit hash and remote branch.

## Plan Self-Review

- Spec sections 1–6 map to Tasks 1–6; API/UI projection behavior maps to Task 7; source and currency invariants map to Tasks 1–8.
- PDF follow-on workstreams are deliberately recorded in the approved spec and use separate focused plans after the settlement foundation; this plan's deliverable is the all-source settlement ledger and its counterparty read path.
- The shared service contract is defined in Task 1 and reused with the same `settlementSide`, idempotency key, signed amount, and `Prisma.TransactionClient` in later tasks.
