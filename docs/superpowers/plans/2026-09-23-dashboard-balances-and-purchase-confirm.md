# Dashboard Balances and Purchase Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place individual bank/cash balances in the dashboard KPI area, standardize return-cancellation buttons to yes/no, and fix the confirmed purchase-approval server failure with a regression check.

**Architecture:** Keep dashboard work in the existing localized Next.js page and use its current `finance.accounts` data and currency formatter. Change only the localized text passed to the existing confirmation provider for purchase and sales return cancellation. Diagnose the purchase approval `PUT` and `POST` separately, then add the regression check and minimal fix at the layer identified by the server exception.

**Tech Stack:** Next.js 16, React 19, TypeScript, NestJS 11, Prisma 7, Jest 30.

## Global Constraints

- Display each account in its native currency; never combine amounts from different currencies.
- Preserve the existing dark dashboard theme and responsive KPI grid.
- Use Uzbek “Ha”/“Yo‘q” and Russian “Да”/“Нет” for all purchase- and sales-return cancellation confirmations.
- Keep backend stack traces out of user-facing messages.
- Do not treat the current stale unit-test mocks as evidence of the runtime 500; reproduce the actual failing request before changing backend behavior.

---

## File Map

- `frontend/src/app/[locale]/page.tsx` — dashboard KPI order and account-balance card presentation.
- `frontend/src/components/purchases/PurchaseReturnDocumentForm.tsx` — purchase-return cancellation confirmation labels on the detail page.
- `frontend/src/app/[locale]/(dashboard)/purchases/returns/page.tsx` — purchase-return cancellation labels in the list.
- `frontend/src/app/[locale]/(dashboard)/sales/returns/page.tsx` — sales-return cancellation labels.
- `backend/src/modules/purchases/purchases.service.ts` — purchase receipt save/post implementation if the captured exception identifies this service.
- `backend/src/modules/purchases/purchases.controller.ts` and `backend/src/modules/purchases/dto/create-purchase-receipt.dto.ts` — approval request handling/validation only if the captured failure identifies these boundaries.
- `backend/src/modules/purchases/purchases.service.unit.spec.ts` — purchase service regression test and current Prisma test-double updates required by the tested path.
- `backend/test/app.e2e-spec.ts` — HTTP-level regression test only if the captured failure is at the Nest route or request-validation boundary.

## Task 1: Move account balances into the main KPI grid

**Files:**
- Modify: `frontend/src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `FullDashboard.finance.accounts: CashAccount[]` (`id`, `accountType`, localized `name`, `currency`, `balance`).
- Produces: one localized, native-currency balance card per account in the existing KPI grid; sales, expenses, and gross-profit cards remain in that grid.

- [ ] **Step 1: Replace the aggregate cash KPI with account cards**

Remove the local `uzsAccount`, `usdAccount`, and `bankAccount` selectors and the “Jami naqd pul” card. Map `data?.finance?.accounts` before the sales KPI in `Core KPI Row`. Use the existing `Wallet` icon for cash accounts and `Building2` for bank accounts, with account-type colors consistent with the current green/blue/primary palette. Show the localized account name and use `formatCurrency(account.balance, locale, account.currency)` for the amount.

The rendered card should follow this structure and the page’s existing design tokens:

```tsx
{data?.finance?.accounts.map((account) => {
  const isBank = account.accountType === 'BANK';
  const Icon = isBank ? Building2 : Wallet;
  const accent = account.accountType === 'UZS_CASH'
    ? 'var(--color-success-600)'
    : account.accountType === 'USD_CASH'
      ? 'var(--color-info-600)'
      : 'var(--color-primary-600)';

  return (
    <div key={account.id} style={{
      minWidth: 0,
      padding: 'var(--space-4)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border-light)',
      borderTop: `3px solid ${accent}`,
    }}>
      <Icon size={18} style={{ color: accent }} />
      <div>{account.name[locale]}</div>
      <div>{formatCurrency(account.balance, locale, account.currency)}</div>
    </div>
  );
})}
```

- [ ] **Step 2: Remove the duplicate bottom balance panel**

Delete the “Bank va naqd pul balanslari” card currently rendered after Recent Transactions. Keep the account data source and the native currency values only in the KPI area.

- [ ] **Step 3: Verify dashboard types and production compilation**

Run from `frontend/`:

```bash
npx tsc --noEmit
npm run build
```

Expected: both commands succeed. Confirm in the rendered dashboard that account cards appear before sales/expenses/profit, the aggregate card and bottom panel are gone, and the cards wrap without horizontal overflow at narrow widths.

## Task 2: Use localized yes/no labels on return cancellation dialogs

**Files:**
- Modify: `frontend/src/components/purchases/PurchaseReturnDocumentForm.tsx`
- Modify: `frontend/src/app/[locale]/(dashboard)/purchases/returns/page.tsx`
- Modify: `frontend/src/app/[locale]/(dashboard)/sales/returns/page.tsx`

**Interfaces:**
- Consumes: existing `confirm({ confirmText, cancelText })` options and each page’s `isRu` locale flag.
- Produces: localized yes/no labels without changing confirmation state or request behavior.

- [ ] **Step 1: Update the purchase detail and purchase list labels**

In both purchase-return cancellation handlers, replace only the current `confirmText` and `cancelText` values with:

```tsx
confirmText: isRu ? 'Да' : 'Ha',
cancelText: isRu ? 'Нет' : 'Yo‘q',
```

- [ ] **Step 2: Update the sales return cancellation labels**

In `handleCancelReturn`, use the same `confirmText` and `cancelText` values. Keep the existing warning description and API call unchanged.

- [ ] **Step 3: Verify dialog semantics and frontend compilation**

Run from `frontend/`:

```bash
npm run build
```

Verify both locales and all three entry points. “Ha”/“Да” continues cancellation; “Yo‘q”/“Нет”, Escape, and the close control dismiss without sending the cancellation request.

## Task 3: Capture the actual purchase-approval failure

**Files:**
- No source changes until the actual failing request and server exception are identified.
- Inspect: `frontend/src/components/purchases/PurchaseDocumentForm.tsx` (`saveDocument` and `handlePost`).
- Inspect: backend logs for `PUT /api/purchases/receipts/:id` and `POST /api/purchases/receipts/:id/post`.

**Interfaces:**
- Consumes: the observed “Tasdiqlash” action and a disposable DRAFT purchase receipt in a local/staging database.
- Produces: the failing HTTP method/path, response status/body, matching backend exception, and the smallest reproducible input.

The user’s Network responses confirm that the preceding `PUT /api/purchases/receipts/:id` returns 200 and `POST /api/purchases/receipts/:id/post` returns 500. The backend `HttpExceptionFilter` logs unknown 500s with the `[500 ERROR IN HANDLER]` prefix, so the matching Render log is the remaining diagnostic artifact.

- [ ] **Step 1: Observe both approval requests in a safe environment**

Use a local or staging copy with a disposable DRAFT receipt, open browser DevTools Network with Preserve log enabled, and click “Tasdiqlash” once. Record the `PUT` and `POST` responses separately; match the failing request timestamp to the backend exception. Do not repeat against a live receipt because successful posting changes inventory and accounting state.

- [ ] **Step 2: Stop if the server exception is unavailable**

If the local/staging service cannot reproduce the failure, request the backend stack trace and the failed request’s method, status, and response body from the user. Do not guess from the generic “Ichki server xatosi” banner and do not count a passing mock-only service test as reproducing the runtime issue.

- [ ] **Step 3: Rank and probe falsifiable causes**

After capturing the failure, show the user 3–5 ranked causes, each with a prediction that can be checked against the captured request. Probe one cause at a time and record whether its prediction matches the observed backend exception. Do not begin this step without the actual failure trace.

## Task 4: Add a regression check and fix the evidenced backend fault

**Files:**
- Test: `backend/src/modules/purchases/purchases.service.unit.spec.ts` when the fault is in `PurchasesService`.
- Test: `backend/test/app.e2e-spec.ts` when the fault is at controller/request-validation or HTTP serialization boundaries.
- Modify only the backend implementation file named by the captured stack trace; likely candidates are listed in the File Map.

**Interfaces:**
- Consumes: the exact failing request and exception from Task 3.
- Produces: a focused regression check that fails on the reproduced failure and passes after the minimal fix.

- [ ] **Step 1: Restore the relevant unit-test doubles to the current Prisma surface**

The focused service suite currently has stale mocks: its shared Prisma double lacks `counterpartyBalance.upsert`, and unposting lacks `additionalExpense.findFirst`. When those delegates are exercised by the selected service test, initialize them as follows:

```ts
counterpartyBalance: {
  upsert: jest.fn().mockResolvedValue({}),
},
additionalExpense: {
  findFirst: jest.fn().mockResolvedValue(null),
},
```

Use only delegates needed by the selected regression seam. If the failure is outside this service seam, use the corresponding HTTP/integration seam instead of masking it with extra unit mocks.

- [ ] **Step 2: Write and run the failing regression check**

Add a test named `preserves purchase receipt approval for the captured failure case`. Use the smallest input that reproduces the captured exception. Assert the expected observable result (successful response/status transition or the exact domain validation outcome), not merely that the service does not throw. Run the focused test before the implementation change and confirm it fails for the reported reason.

- [ ] **Step 3: Apply the smallest fix supported by the exception**

Change only the responsible service, controller, DTO, or schema/migration behavior. Preserve tenant scoping, stock/accounting transaction boundaries, and existing domain invariants. Do not expose raw stack traces in the API response.

- [ ] **Step 4: Re-run the regression and purchase verification**

Run the focused test from `backend/`:

```bash
npm test -- --runInBand modules/purchases/purchases.service.unit.spec.ts -t "preserves purchase receipt approval for the captured failure case"
```

If the fault is covered at the HTTP boundary, also run:

```bash
npm test -- --runInBand --config ./test/jest-e2e.json
```

Expected: the regression check passes, the captured safe-environment request completes, and the receipt reaches POSTED exactly once with the intended stock/debt/journal effects.

## Final verification

- From `frontend/`: `npx tsc --noEmit` and `npm run build`.
- From `backend/`: the focused purchase regression command above; run the e2e command only if the fix touches an HTTP boundary.
- Review all changed files and ensure the dashboard still displays each account in its original currency and all return confirmations use the requested labels.
