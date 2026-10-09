# Finance Deleted Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance trash section for explicitly deleted transactions, with accounting-safe delete and restore behavior.

**Architecture:** Reuse `FinanceTransaction.isDeleted` and the current Storno reversal logic; refactor reversal so delete can set `CANCELLED` and `isDeleted` in the same Prisma transaction. Add tenant-scoped deleted-list and restore service/controller methods, then expose them through the Finance page’s existing navigation, table, and modal patterns.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Jest 30, Next.js 16.3 client component, React 19, TypeScript 5, `apiFetch`, existing Finance UI components.

## Global Constraints

- **No database schema change:** use the existing `FinanceTransaction.status`, cancellation audit fields, and `isDeleted` fields.
- **Atomic deletion:** a posted transaction’s financial reversal and soft deletion happen in one database transaction.
- **Already cancelled:** deletion only sets `isDeleted = true`; never reverse the financial effect a second time or overwrite original cancellation audit fields.
- **Restore:** set `isDeleted = false`; the transaction remains `CANCELLED` and its financial effects are not reapplied.
- **No permanent deletion:** retain finance transaction and audit history.
- **Scope:** all Finance `FinanceTransaction` directions: Kirim, Chiqim, and O‘tkazma. Storno alone does not move a record to the trash.
- **Permissions:** reads require `finance:view`; delete and restore require `finance:delete`; every operation is tenant-scoped.
- **Locales:** add Uzbek and Russian labels/copy using the Finance page’s existing `isRu` conditional convention.
- Before changing the Next.js client page, read `frontend/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` as required by `frontend/AGENTS.md`.

---

## File Structure

- `backend/src/modules/finance/finance.service.ts` — transaction reversal, soft delete, deleted listing, and restore.
- `backend/src/modules/finance/finance.controller.ts` — protected deleted-list and restore routes; pass the current user to delete for cancellation audit.
- `backend/src/modules/finance/finance-settlement.spec.ts` — observable service-level lifecycle and accounting tests.
- `frontend/src/app/[locale]/(dashboard)/finance/page.tsx` — deleted tab, delete confirmation, row delete/restore actions, and list fetching.
- `shared/types/finance.ts` — no changes expected; `FinanceTransaction` and `TransactionJournal` already represent the returned data.
- `backend/prisma/schema.prisma` and migrations — no changes expected.
- `docs/superpowers/specs/2026-09-23-finance-deleted-transactions-design.md` — approved design source.

## Task 1: Implement atomic soft deletion and backend listing/restore

**Files:**
- Modify: `backend/src/modules/finance/finance.service.ts`
- Test: `backend/src/modules/finance/finance-settlement.spec.ts`

**Interfaces:**
- Add `getDeletedTransactions(tenantId: string, filters: FilterTransactionsDto)` returning `{ total, page, limit, data }`, the same result shape and relations as `getTransactions`.
- Add `restoreTransaction(tenantId: string, id: string)` returning the restored transaction with `isDeleted: false` and its unchanged `CANCELLED` status.
- Change `deleteTransaction` to accept `deletedById?: string`; it returns `{ success: true, id, status, isDeleted: true }`.
- Factor the shared posted-transaction reversal into `reversePostedTransaction(tx, tenantId, existing, dto, cancelledById, isDeleted)`, used by both `cancelTransaction` and `deleteTransaction`. `tx` is a Prisma transaction client, `existing` is the fetched transaction, `dto` is `CancelTransactionDto | undefined`, `cancelledById` is `string | undefined`, and `isDeleted` is a boolean.
- Factor journal retrieval into a private helper that accepts `isDeleted: boolean`; `getTransactions` passes `false`, `getDeletedTransactions` passes `true`.

- [ ] **Step 1: Extend the FinanceService Prisma mock and add failing lifecycle tests**

In the `beforeEach` Prisma mock in `finance-settlement.spec.ts`, add `counterpartyBalance: { upsert: jest.fn() }` because the current income/expense reversal updates currency-specific counterparty balances. Add a `describe('Deleted Finance Transactions')` block with these cases:

```ts
it('reverses posted income and marks it deleted atomically', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-delete',
    tenantId: 'tenant-1',
    direction: TransactionDirection.INCOME,
    status: TransactionStatus.POSTED,
    accountId: 'acc-1',
    amount: 2000000,
    currency: 'UZS',
    counterpartyId: 'cust-1',
    sourceDocType: 'SalesInvoice',
    sourceDocId: 'inv-1',
  });
  prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 3000000 });
  prisma.salesInvoice.findFirst.mockResolvedValue({
    id: 'inv-1',
    totalAmount: 5000000,
    paidAmount: 2000000,
  });

  const result = await service.deleteTransaction('tenant-1', 'tx-delete', 'user-1');

  expect(result).toEqual({
    success: true,
    id: 'tx-delete',
    status: TransactionStatus.CANCELLED,
    isDeleted: true,
  });
  expect(prisma.cashAccount.update).toHaveBeenCalledWith({
    where: { id: 'acc-1' },
    data: { balance: { decrement: 2000000 } },
  });
  expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'tx-delete',
      tenantId: 'tenant-1',
      isDeleted: false,
      status: TransactionStatus.POSTED,
    },
    data: expect.objectContaining({
      status: TransactionStatus.CANCELLED,
      cancelledById: 'user-1',
      isDeleted: true,
    }),
  });
  expect(prisma.counterparty.update).toHaveBeenCalledWith({
    where: { id: 'cust-1' },
    data: {
      customerDebt: { increment: 2000000 },
      debtBalance: { increment: 2000000 },
    },
  });
  expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
    where: { id: 'inv-1' },
    data: { paidAmount: 0, paymentStatus: SalesPaymentStatus.UNPAID },
  });
});
```

Add the following companion tests in the same describe block:

```ts
it('restores expense cash, supplier debt, and receipt balance before soft deletion', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-expense',
    tenantId: 'tenant-1',
    direction: TransactionDirection.EXPENSE,
    status: TransactionStatus.POSTED,
    accountId: 'acc-1',
    amount: 2000000,
    currency: 'UZS',
    counterpartyId: 'supplier-1',
    sourceDocType: 'PurchaseReceipt',
    sourceDocId: 'receipt-1',
  });
  prisma.purchaseReceipt.findFirst.mockResolvedValue({
    id: 'receipt-1',
    totalAmount: 5000000,
    paidAmount: 2000000,
  });

  await service.deleteTransaction('tenant-1', 'tx-expense', 'user-1');

  expect(prisma.cashAccount.update).toHaveBeenCalledWith({
    where: { id: 'acc-1' },
    data: { balance: { increment: 2000000 } },
  });
  expect(prisma.counterparty.update).toHaveBeenCalledWith({
    where: { id: 'supplier-1' },
    data: {
      supplierDebt: { increment: 2000000 },
      debtBalance: { increment: 2000000 },
    },
  });
  expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
    where: { id: 'receipt-1' },
    data: { paidAmount: 0, paymentStatus: PurchasePaymentStatus.UNPAID },
  });
  expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'tx-expense',
      tenantId: 'tenant-1',
      isDeleted: false,
      status: TransactionStatus.POSTED,
    },
    data: expect.objectContaining({ isDeleted: true, status: TransactionStatus.CANCELLED }),
  });
});

it('reverses both cash-account movements before soft deleting a transfer', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-transfer',
    tenantId: 'tenant-1',
    direction: TransactionDirection.TRANSFER,
    status: TransactionStatus.POSTED,
    accountId: 'acc-source',
    transferToId: 'acc-destination',
    amount: 100,
    transferToAmount: 120,
    currency: 'USD',
  });
  prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-destination', balance: 200 });

  await service.deleteTransaction('tenant-1', 'tx-transfer', 'user-1');

  expect(prisma.cashAccount.update).toHaveBeenNthCalledWith(1, {
    where: { id: 'acc-destination' },
    data: { balance: { decrement: 120 } },
  });
  expect(prisma.cashAccount.update).toHaveBeenNthCalledWith(2, {
    where: { id: 'acc-source' },
    data: { balance: { increment: 100 } },
  });
  expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'tx-transfer',
      tenantId: 'tenant-1',
      isDeleted: false,
      status: TransactionStatus.POSTED,
    },
    data: expect.objectContaining({ isDeleted: true, status: TransactionStatus.CANCELLED }),
  });
});

it('rejects deletion when the POSTED compare-and-set no longer matches', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-stale-delete',
    tenantId: 'tenant-1',
    direction: TransactionDirection.INCOME,
    status: TransactionStatus.POSTED,
    accountId: 'acc-1',
    amount: 100,
  });
  prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 500 });
  prisma.financeTransaction.updateMany.mockResolvedValue({ count: 0 });

  await expect(service.deleteTransaction('tenant-1', 'tx-stale-delete', 'user-1')).rejects.toThrow(
    NotFoundException,
  );
  expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'tx-stale-delete',
      tenantId: 'tenant-1',
      isDeleted: false,
      status: TransactionStatus.POSTED,
    },
    data: expect.objectContaining({ isDeleted: true, status: TransactionStatus.CANCELLED }),
  });
});

it('does not mark income deleted when reversal would make cash negative', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-insufficient',
    tenantId: 'tenant-1',
    direction: TransactionDirection.INCOME,
    status: TransactionStatus.POSTED,
    accountId: 'acc-1',
    amount: 2000000,
  });
  prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 500000 });

  await expect(service.deleteTransaction('tenant-1', 'tx-insufficient', 'user-1')).rejects.toThrow(
    BadRequestException,
  );
  expect(prisma.financeTransaction.update).not.toHaveBeenCalled();
  expect(prisma.financeTransaction.updateMany).not.toHaveBeenCalled();
  expect(prisma.cashAccount.update).not.toHaveBeenCalled();
});

it('moves an already-cancelled transaction to trash without repeating the reversal', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-cancelled',
    tenantId: 'tenant-1',
    direction: TransactionDirection.INCOME,
    status: TransactionStatus.CANCELLED,
    accountId: 'acc-1',
    amount: 2000000,
  });

  await service.deleteTransaction('tenant-1', 'tx-cancelled', 'user-1');

  expect(prisma.financeTransaction.update).toHaveBeenCalledWith({
    where: { id: 'tx-cancelled' },
    data: { isDeleted: true },
  });
  expect(prisma.cashAccount.update).not.toHaveBeenCalled();
  expect(prisma.salesInvoice.update).not.toHaveBeenCalled();
});

it('restores a deleted transaction to the journal without reapplying its financial effect', async () => {
  prisma.financeTransaction.findFirst.mockResolvedValue({
    id: 'tx-restore',
    tenantId: 'tenant-1',
    status: TransactionStatus.CANCELLED,
    isDeleted: true,
  });
  prisma.financeTransaction.update.mockResolvedValue({
    id: 'tx-restore',
    status: TransactionStatus.CANCELLED,
    isDeleted: false,
  });

  const result = await service.restoreTransaction('tenant-1', 'tx-restore');

  expect(result).toEqual({
    id: 'tx-restore',
    status: TransactionStatus.CANCELLED,
    isDeleted: false,
  });
  expect(prisma.financeTransaction.update).toHaveBeenCalledWith({
    where: { id: 'tx-restore' },
    data: { isDeleted: false },
  });
  expect(prisma.cashAccount.update).not.toHaveBeenCalled();
});

it('lists journal and deleted transactions with opposite soft-delete filters', async () => {
  prisma.financeTransaction.count.mockResolvedValue(0);
  prisma.financeTransaction.findMany.mockResolvedValue([]);

  await service.getTransactions('tenant-1', { page: 1, limit: 25 });
  await service.getDeletedTransactions('tenant-1', { page: 1, limit: 25 });

  expect(prisma.financeTransaction.findMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', isDeleted: false }) }),
  );
  expect(prisma.financeTransaction.findMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', isDeleted: true }) }),
  );
});
```

Also exercise the shared compare-and-set via `cancelTransaction`: mock `updateMany` to return `{ count: 0 }`, expect `NotFoundException`, and assert the request did not set `isDeleted`. For rollback routing, use a separate transaction-client mock with a persisted-state object and transaction-local clone; mutate the clone for cash/counterparty writes, make `counterpartyBalance.upsert` reject, and assert the service rejects, the clone contains the attempted writes, and persisted POSTED/not-deleted state is unchanged. This unit fake models the transaction boundary but does not replace a database integration test.

- [ ] **Step 2: Run the focused tests and confirm the new cases fail**

Run from `backend/`:

```bash
npm test -- --runInBand modules/finance/finance-settlement.spec.ts
```

Expected: existing Storno tests run, and new cases fail because deleted-list, restore, and atomic delete behavior are not implemented yet.

- [ ] **Step 3: Share reversal logic and implement the deleted lifecycle**

Move the existing cash, counterparty-balance, linked invoice/order/receipt/service-act, and transfer reversal operations into one private helper. Keep those calculations and guardrails unchanged. Its final transaction update must include `isDeleted` only when called for delete; normal Storno must keep `isDeleted: false`.

Use the following orchestration in `deleteTransaction` so the lookup, reversal, and `isDeleted` update share one Prisma transaction:

```ts
return this.prisma.$transaction(async (tx) => {
  const existing = await tx.financeTransaction.findFirst({
    where: { id, tenantId, isDeleted: false },
    include: { account: true, transferToAccount: true },
  });
  if (!existing) throw new NotFoundException('Transaction not found');

  if (existing.status === TransactionStatus.POSTED) {
    return this.reversePostedTransaction(tx, tenantId, existing, undefined, deletedById, true);
  }

  await tx.financeTransaction.update({ where: { id }, data: { isDeleted: true } });
  return { success: true, id, status: existing.status, isDeleted: true };
});
```

The helper’s `true` flag records `isDeleted: true` together with `status: CANCELLED`, `cancelledById`, and `cancelledAt`. Do not call `cancelTransaction` from `deleteTransaction`, because that would commit reversal separately from soft deletion.

Extract the current `getTransactions` query into a private list helper using `where: { tenantId, isDeleted }`, retaining current pagination, filters, included relations, and ordering. Implement `getTransactions` with `false` and `getDeletedTransactions` with `true`. Implement `restoreTransaction` by finding `{ id, tenantId, isDeleted: true }`, throwing `NotFoundException` when absent, and updating only `isDeleted: false`.

- [ ] **Step 4: Run the focused Finance service tests**

Run from `backend/`:

```bash
npm test -- --runInBand modules/finance/finance-settlement.spec.ts
```

Expected: all Storno, delete, list, and restore tests pass; deletion failures do not mark the record deleted.

## Task 2: Expose tenant-protected deleted and restore endpoints

**Files:**
- Modify: `backend/src/modules/finance/finance.controller.ts`

**Interfaces:**
- `GET /api/finance/transactions/deleted` → `financeService.getDeletedTransactions(tenantId, filters)` with `finance:view`.
- `DELETE /api/finance/transactions/:id` → `financeService.deleteTransaction(tenantId, id, user?.id)` with `finance:delete`.
- `POST /api/finance/transactions/:id/restore` → `financeService.restoreTransaction(tenantId, id)` with `finance:delete`.

- [ ] **Step 1: Add the deleted-list route before the journal route**

Add a `GET('transactions/deleted')` controller method that accepts `@CurrentTenant()` and `@Query() filters: FilterTransactionsDto`, requires `finance:view`, and calls `getDeletedTransactions`. Keep `GET('transactions')` unchanged for the normal journal.

- [ ] **Step 2: Pass the current user to delete and add restore**

Add `@CurrentUser() user: any` to `deleteTransaction` and pass `user?.id` to the service. Add `POST('transactions/:id/restore')`, `@HttpCode(HttpStatus.OK)`, `finance:delete`, `@CurrentTenant()`, and `@Param('id')`; call `restoreTransaction(tenantId, id)`.

- [ ] **Step 3: Build the backend**

Run from `backend/`:

```bash
npm run build
```

Expected: NestJS compilation succeeds with the new service/controller signatures.

## Task 3: Add the Finance trash tab and actions

**Files:**
- Modify: `frontend/src/app/[locale]/(dashboard)/finance/page.tsx`

**Interfaces:**
- Extend the active-tab union with `'deleted'`.
- In deleted view, fetch `/finance/transactions/deleted` with the existing page/filter parameters; normal views continue fetching `/finance/transactions`.
- Delete uses `DELETE /finance/transactions/:id`; restore uses `POST /finance/transactions/:id/restore`.
- Reuse `TransactionsTable` and existing `Modal`, `toast`, and `apiFetch` patterns.

- [ ] **Step 1: Read the installed Next.js Client Component guide**

Read `frontend/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` and follow it when editing the existing client page.

- [ ] **Step 2: Add the deleted tab and fetch the corresponding list**

Add the `'deleted'` tab to the state union and navigation list with labels `O‘chirilganlar` and `Удалённые`. In `fetchData`, choose the deleted endpoint only when `activeTab === 'deleted'`; retain the current query string filters, pagination, and tenant/locale options. Include the deleted tab in the transaction-table content condition.

- [ ] **Step 3: Add delete confirmation and request handlers**

Add a selected-transaction state and loading state for deletion. The confirmation text must differ by status: for `POSTED`, say the financial effect will be reversed and moved to trash; for `CANCELLED`, say it will only be moved to trash. On confirm, call `DELETE /finance/transactions/${id}`; on success, close the modal, refresh data, and show a bilingual success toast; on failure, keep the modal/row state and show the backend error.

Add a restore handler calling `POST /finance/transactions/${id}/restore`; on success refresh the list and show a bilingual confirmation toast. Do not add a permanent-delete action.

- [ ] **Step 4: Add row actions and deleted-list empty state**

Import `Trash2` and a return icon such as `RotateCcw` from `lucide-react`. Add the trash action to active journal rows even when they are already `CANCELLED`; keep Edit and Storno available only for `POSTED` rows. In the deleted view, replace those actions with **Jurnalga qaytarish** / **Вернуть в журнал**. Keep the existing transaction columns and pagination, and use an empty-state message for an empty trash.

- [ ] **Step 5: Lint and type-check the Finance page**

Run from `frontend/`:

```bash
npm run lint -- "src/app/[locale]/(dashboard)/finance/page.tsx"
npx tsc --noEmit
```

Expected: TypeScript finishes without errors. The Finance page lint command reports the same 27 pre-existing errors and 10 warnings as the committed baseline; the feature diff must add no new lint findings.

## Task 4: Full feature verification

**Files:**
- No additional files; verify the backend and frontend changes from Tasks 1–3.

- [ ] **Step 1: Run the Finance settlement test suite**

Run from `backend/`:

```bash
npm test -- --runInBand modules/finance/finance-settlement.spec.ts
```

Expected: existing settlement/Storno behavior and all added deleted-transaction lifecycle cases pass.

- [ ] **Step 2: Run backend build and frontend validation**

Run from `backend/`:

```bash
npm run build
```

Run from `frontend/`:

```bash
npm run lint -- "src/app/[locale]/(dashboard)/finance/page.tsx"
npx tsc --noEmit
```

Expected: backend build and TypeScript finish without errors. The targeted Finance page lint has 27 pre-existing errors and 10 warnings on the committed baseline; confirm the feature diff adds no new lint findings.

## Plan self-review

- Spec lifecycle requirements map to Task 1 tests and service behavior.
- Tenant isolation and `finance:view` / `finance:delete` permissions map to Task 2.
- Tab, bilingual UI, confirmation, row actions, refresh, and empty state map to Task 3.
- No schema migration or permanent-delete path is introduced.
- Method names and parameter types in the API, service, and UI tasks are consistent.
