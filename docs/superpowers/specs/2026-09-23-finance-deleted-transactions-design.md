# Finance Deleted Transactions — Design

**Date:** 2026-09-23
**Status:** Approved
**Context:** Moliya bo‘limida o‘chirilgan moliyaviy amallar alohida savatda ko‘rinishi va kerak bo‘lsa jurnalga qaytarilishi kerak.

## Goal

Add an **O‘chirilganlar** (Deleted) section to Finance. Explicitly deleted finance transactions leave the normal journal and appear in this section. Users can return a transaction to the journal without reapplying its financial effect.

## Current behavior

- `FinanceTransaction` already has `status`, cancellation audit fields, and `isDeleted`.
- Normal transaction queries already exclude `isDeleted: true` records.
- Storno reverses the transaction’s cash, counterparty-debt, and linked-document effects, then marks it `CANCELLED`.
- The DELETE endpoint currently calls Storno but does not set `isDeleted`; there is no deleted-transactions view or restore action.
- Finance transactions include income, expenses, and transfers.

## Design

### Lifecycle and accounting

Deletion is separate from Storno in the user interface, while preserving the existing accounting reversal rules:

1. Deleting a `POSTED` transaction reverses its financial effects using the current Storno invariants and, in the same database transaction, sets `status = CANCELLED`, records the cancellation user/time, and sets `isDeleted = true`.
2. If the transaction is already `CANCELLED`, deletion only sets `isDeleted = true`; it must not reverse the transaction a second time or overwrite the original cancellation audit fields.
3. If reversal fails—for example, reversing income would make the source cash account negative—the whole operation rolls back. The transaction remains visible in the journal and its balances/documents remain unchanged.
4. Restoring a deleted transaction sets `isDeleted = false`. Its status remains `CANCELLED`, and its financial effects are not reapplied. It becomes visible in the normal journal as a cancelled transaction.
5. There is no permanent-delete operation. The transaction and its audit history remain stored.

This applies to all `FinanceTransaction` directions shown in Moliya: Kirim, Chiqim, and O‘tkazma. Storno by itself does not move a transaction to the trash; a user must explicitly delete it.

### Backend API

- Keep `DELETE /api/finance/transactions/:id` as the explicit move-to-trash operation. Require the existing `finance:delete` permission and enforce tenant ownership.
- Add `GET /api/finance/transactions/deleted`, returning paginated soft-deleted transactions for the current tenant with the same account, counterparty, and transaction-type relations used by the journal.
- Add `POST /api/finance/transactions/:id/restore`, requiring `finance:delete`, enforcing tenant ownership, and only accepting a currently deleted transaction.
- Keep the normal `GET /api/finance/transactions` query restricted to `isDeleted: false`.
- Do not add schema fields or change the database schema; use the existing lifecycle and `isDeleted` fields.

### Finance UI

- Add an **O‘chirilganlar** navigation tab beside the existing Finance tabs, with Uzbek and Russian labels.
- Add a trash action to each transaction row. Keep the existing Storno action distinct and available only for posted transactions. The trash action is also available for already-cancelled transactions so they can be moved out of the journal without repeating Storno.
- Confirm deletion before submission. For a posted transaction, explain that its financial effect will be reversed before it is moved to the trash. Display backend errors without changing the row when reversal is rejected.
- Show deleted transactions in the new tab using the existing transaction columns and pagination. Provide a **Jurnalga qaytarish** action for each row; do not provide permanent deletion.
- Refresh Finance data after a successful delete or restore.

## Permissions and data isolation

Read operations use the existing `finance:view` permission. Delete and restore use `finance:delete`. All list, delete, and restore operations must be tenant-scoped; a transaction from another tenant must not be returned or changed.

## Verification

Backend tests should verify observable transaction, cash-account, counterparty-debt, and linked-document state:

- Deleting a posted income, expense, and transfer reverses their effects and moves each record to the trash.
- A failed reversal leaves the transaction posted and not deleted, with related balances unchanged.
- Deleting an already-cancelled transaction does not apply a second reversal.
- The deleted list includes only the current tenant’s soft-deleted transactions; the normal journal excludes them.
- Restoring a deleted transaction makes it visible in the journal as `CANCELLED` without changing financial balances again.

Frontend verification should include TypeScript/lint checks available in the repository and confirm both locale labels and the new row actions compile.

## Out of scope

- Permanent deletion or purging of finance audit records.
- Restoring a deleted transaction to `POSTED` or reapplying its financial effects.
- Automatically moving Storno-only transactions to the trash.
- Changes to other payment models or modules outside the Finance transaction journal.
