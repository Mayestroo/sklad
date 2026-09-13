# Specification: Posted Document Edit & Delete Lifecycle, Unpost-to-Edit Workflow & Atomic Reversals

## Problem Statement

In operational enterprise resource planning (ERP) workflows across warehouse procurement and distribution, human mistakes inevitably occur: incorrect item pricing, wrong quantities, typo in supplier name, or duplicated records. Previously:
1. **Invisible Delete Action for Posted Documents**: Delete buttons (`Trash2`) on document list tables were conditionally hidden unless the document was in `DRAFT` or `CANCELLED` status. Because the vast majority of operational documents in a working business are in `POSTED` status, users encountered a dead end with no visible delete action ("delete yo'q").
2. **Read-Only Lockout on Edit**: Clicking the Edit button (`Pencil`) navigated the user to the document form, but because the document was in `POSTED` status, the form disabled every input field, dropdown, and action button (`isReadOnly`). Users were unable to make corrections ("edit bosilganda edit bo'lmayapti").
3. **Fragmented Cancellation & Reversal Workflows**: Different operational modules handled document lifecycles inconsistently. In some modules users had to manually find an unpost or cancel action before deleting, while in other modules cancelled records could not be permanently removed.
4. **Vulnerability to Stock & Ledger Corruption**: Without a coordinated and atomic rollback sequence, deleting operational documents could create "ghost stock", unbacked accounts receivable, dangling FIFO inventory batches, or orphaned double-entry journal entries.

## Solution

A unified, secure, and intuitive **Posted Document Edit & Delete Lifecycle** applied symmetrically across Procurement Receipts, Sales Invoices, Landed Cost Additional Expenses, and Sales Orders:
1. **Unconditional Action Visibility**: Edit (`Pencil`) and Delete (`Trash2`) actions are rendered visibly across all table rows regardless of document status, providing an immediate, clear affordance to the user.
2. **Unpost-to-Edit Workflow**: 
   - Clicking Edit on a posted record navigates to the document form with an explicit edit intent (`?edit=true`).
   - A prominent amber guidance banner explains that the document is currently posted, informing the user that editing requires an unpost step.
   - An intuitive "Tahrirlashga ruxsat berish" (Allow Editing) action prompts the user and calls the backend unpost endpoint, safely reverting inventory movements, journal entries, and debt accruals.
   - The document transitions to `DRAFT` status, instantly unlocking all line items, customer/supplier selectors, price inputs, and tax configurations for editing.
3. **Atomic Posted Deletion with Automatic Reversal**:
   - Clicking Delete on a `POSTED` record displays a clear confirmation dialog explaining that the document will be automatically unposted (reversing warehouse stock, closing batches, cancelling debts, and voiding journal entries) before being permanently deleted.
   - Upon user confirmation, the system performs an atomic unpost/cancel call followed immediately by the delete call, refreshing the data table in a single seamless user experience.
4. **Strict Financial Rollback Guardrails**:
   - If an invoice, receipt, or expense has linked settled payments (`paidAmount > 0`), the unpost and delete operations are strictly rejected with an informative error message instructing the user to void the payment in the Finance module first.
   - If an invoice or receipt has linked customer or vendor return documents, deletion is blocked to protect historical audit integrity.
5. **Automatic Stock Reservation Release**:
   - Deleting open sales orders automatically and cleanly releases all reserved warehouse stock back to available sellable inventory.

## User Stories

1. As a warehouse manager, I want to see the Delete (`Trash2`) icon on every procurement receipt row in the purchases table, so that I don't have to wonder why some rows cannot be removed.
2. As a warehouse manager, I want to click Delete on a posted procurement receipt and see an explanation that stock and supplier debt will be reversed, so that I understand the financial consequences before confirming.
3. As a procurement officer, I want to click Edit (`Pencil`) on a posted procurement receipt and be guided with a clear banner explaining how to unlock the document, so that I can fix a typo in received quantities.
4. As a procurement officer, I want clicking "Tahrirlashga ruxsat berish" to transition the receipt to `DRAFT` and unlock all input fields, so that I can adjust line items, prices, and suppliers freely.
5. As an accountant, I want unposting a procurement receipt to decrement warehouse stock and void linked double-entry journal entries (Account 2910 and Account 6010), so that accounting balances remain completely accurate.
6. As an accountant, I want the system to block deletion or unposting of a procurement receipt if cash or bank payments were already disbursed to the supplier, so that audit trails are preserved.
7. As a sales manager, I want to see Delete and Edit buttons on every sales invoice row in the sales list, so that I can correct sales invoices without administrative friction.
8. As a sales manager, I want to navigate to a sales invoice with an edit intent and be automatically prompted to unpost and edit, so that I can immediately correct prices or discounts.
9. As an inventory manager, I want unposting a sales invoice to return sold items to warehouse batches and recalculate cost of goods sold (Account 9110 and Account 2910), so that stock counts are not lost.
10. As an accountant, I want unposting a sales invoice to decrement customer debt (`debtBalance`) and void sales revenue journal entries (Account 4010, Account 9030, Account 6410), so that customer statements reflect true numbers.
11. As a financial manager, I want the system to reject unposting or deleting a sales invoice if the customer has already paid or if goods were returned, so that ledger integrity cannot be broken.
12. As a logistics coordinator, I want to see a Delete button on all landed cost expense records in the expenses table, so that I can remove duplicate transportation or customs expense entries.
13. As a logistics coordinator, I want deleting a posted landed cost expense to automatically cancel the expense, revert the capitalized product batch landed cost, and recalibrate downstream sales invoice COGS before deleting, so that inventory valuation is true.
14. As a sales representative, I want to delete any unfulfilled sales order, so that canceled orders do not clutter the order book.
15. As a warehouse keeper, I want deleting an unfulfilled sales order to automatically release all stock reservations, so that reserved products are immediately available for other customer orders.
16. As an operator, I want all confirmation dialogs, warning banners, and button tooltips to be fully translated into both Uzbek and Russian, so that our team can work comfortably in their language of choice.

## Implementation Decisions

### 1. Document State Architecture & Transitions
- Operational documents follow a two-step editing paradigm: `POSTED` documents are immutable while posted; editing requires transitioning through `DRAFT` via the unpost lifecycle.
- State progression for editing:
  `POSTED` ➔ (User requests edit) ➔ `UNPOST` (reverses inventory, ledgers, debts) ➔ `DRAFT` (fully editable) ➔ (User saves modifications) ➔ `POST` (re-evaluates stock, creates new FIFO batches, logs fresh journal entries).
- State progression for deletion:
  `POSTED` ➔ (User confirms deletion with reversal explanation) ➔ `UNPOST` / `CANCEL` (ledger & stock rollback) ➔ `DELETE` (permanent database purge).

### 2. URL Contract for Direct Edit Intent
- Navigation from list view Edit buttons (`Pencil`) appends `?edit=true` query parameter to the document URL (e.g. `/purchases/UUID?edit=true`, `/sales/UUID?edit=true`).
- When the form mounts and detects `?edit=true` on a `POSTED` document, it immediately triggers the unpost-to-edit confirmation prompt, eliminating unnecessary clicks.

### 3. Visual Guidance & Sticky Header Controls
- When a document is in `POSTED` status, the form renders:
  1. An informational amber banner at the top explaining document status and containing an explicit "Tahrirlashga ruxsat berish" action button.
  2. Action buttons ("Tahrirlash" and "O'chirish") in the top sticky header toolbar alongside standard printing and viewing controls.
- When unposted, the banner disappears, status badges switch to neutral `DRAFT`, and all form inputs transition from disabled to editable.

### 4. Symmetrical Module Lifecycles
- **Purchases (`PurchaseReceipt`)**:
  - Unpost endpoint: `POST /api/purchases/receipts/:id/unpost`
  - Delete endpoint: `DELETE /api/purchases/receipts/:id`
  - Rollback guards: blocks if `paidAmount > 0` or linked purchase returns exist.
- **Sales (`SalesInvoice`)**:
  - Unpost endpoint: `POST /api/sales/invoices/:id/unpost`
  - Delete endpoint: `DELETE /api/sales/invoices/:id`
  - Rollback guards: blocks if `paidAmount > 0` or linked sales returns exist.
- **Additional Expenses (`AdditionalExpense`)**:
  - Cancel endpoint: `POST /api/purchases/additional-expenses/:id/cancel`
  - Delete endpoint: `DELETE /api/purchases/additional-expenses/:id`
  - Rollback guards: blocks if linked finance transaction exists.
- **Sales Orders (`SalesOrder`)**:
  - Delete endpoint: `DELETE /api/sales/orders/:id`
  - Automatically invokes `StockReservationService.releaseOrderReservations`.
  - Blocks only if shipped or invoice generated.

## Testing Decisions

### Seam Architecture
The primary testing seam is the **NestJS Service Layer** across `PurchasesService`, `SalesInvoicesService`, `AdditionalExpensesService`, and `SalesOrdersService`, as well as frontend UI lifecycle integration.

### Test Suites & Invariants
1. **Unpost Reversal Invariants**:
   - Assert that calling unpost on a posted receipt decreases warehouse quantity, removes or zeroes the `ProductBatch`, decreases supplier debt, and deletes linked journal entries.
   - Assert that calling unpost on a posted invoice returns consumed quantities to inventory, decreases customer debt, and voids linked sales revenue entries.
2. **Rollback Guardrail Enforcement**:
   - Assert that attempting to unpost or delete a receipt with `paidAmount > 0` throws `BadRequestException`.
   - Assert that attempting to unpost or delete an invoice with `paidAmount > 0` throws `BadRequestException`.
   - Assert that attempting to cancel or delete an additional expense with linked cash payments throws `BadRequestException`.
3. **Reservation Release Integrity**:
   - Assert that deleting an active sales order in `ACCEPTED` or `PROCESSING` status releases all active `StockReservation` records and restores sellable availability.
4. **End-to-End Edit & Re-post Cycle**:
   - Verify: Create `DRAFT` ➔ Post ➔ Unpost to `DRAFT` ➔ Edit line items ➔ Re-post. Ensure resulting stock counts and accounting balances match the edited values with no duplicate batches.

### Prior Art
- `backend/src/modules/purchases/purchases.service.unit.spec.ts`: Unit tests for receipt status transitions and unpost mechanics.
- `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts`: Test coverage for invoice lifecycle and ledger settlement.
- `backend/src/modules/purchases/additional-expenses.service.unit.spec.ts`: Unit tests for expense rollback and landed cost reversion.

## Out of Scope
- Direct inline editing of posted records without unposting (intentionally excluded to prevent audit log corruption and unverified ledger edits).
- Modifying documents that have external legal tax portal status (Didox / Soliq.uz approved e-invoices require standard tax credit-note / corrective invoice procedures).
- Automatic refund voucher generation when unposting a paid document (payments must be voided or unlinked in the Finance module first).

## Further Notes
- Documented in `docs/adr/0020-posted-document-edit-and-delete-lifecycle.md` and repository domain rules `CONTEXT.md`.
- Both Uzbek (`uz`) and Russian (`ru`) locales are fully supported across all banners, tooltips, dialogs, and error messages.
