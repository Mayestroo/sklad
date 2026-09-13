# 20. Posted Document Edit and Delete Lifecycle

## Context
Operators and managers working in `/purchases/*` and `/sales/*` need to correct mistakes (e.g. wrong quantity, unit price, date, or counterparty) and delete erroneous transactions. However, posted purchase receipts and sales invoices have already affected warehouse inventory balances, FIFO batches, accounting journal entries, and counterparty debt. Directly mutating or hard-deleting a posted record without ledger rollback corrupts financial and stock integrity.

## Decision
1. **Atomic Deletion**: The Delete (`Trash2`) action is visible on all rows across document tables. When invoked on a `POSTED` document, the system verifies that no downstream operations (linked payments or returns) exist, executes an unposting reversal (restoring or decrementing inventory, deleting or restoring batches, and reversing debt & ledger entries), and then cleanly purges the draft document in one user action. If linked payments or returns exist, deletion is rejected with a descriptive error.
2. **Unpost-to-Edit Workflow**: A posted document cannot be edited in-place while locked. When an operator clicks Edit (`Pencil`) on a posted document or views it with edit intent, the UI presents an explicit "Tahrirlashga ruxsat berish" (Разрешить редактирование) action and guidance banner. Confirming this action unposts the document back to `DRAFT`, instantly unlocking all form fields, line items, prices, and quantities for modification and re-posting.
3. **Rollback Guardrails**: Invariants remain strictly enforced. If warehouse stock has dropped below received quantities (for purchases) or if payments/returns are attached (for both purchases and sales), the unpost/delete operation is blocked until the dependencies are cleared.
