# Specification: Mijozdan Qaytarish (Sales Return) Moduli v2.0 — Asl Sotuvga Bog'lanish, Brak Ombori va Moliya Balansi

## Problem Statement

In distribution, wholesale, and retail operations, customers regularly return previously purchased items due to factory defects, expired shelf-life, shipping discrepancies, or customer order cancellations. Previously:
1. **Unconstrained & Untraced Returns**: Returns could be recorded arbitrarily without a strict link to an original posted Sales Invoice, leading to inaccurate sales prices, unverified quantities, and potential fraud.
2. **Over-Return Vulnerability**: Without automated tracking of historical return quantities against original invoice line items, operators could return more items than were originally sold (`over-return`), creating phantom inventory.
3. **Improper Inventory Valuation & Batch Contamination**: Returned goods were often restored at current catalog prices rather than the exact historical unit landed cost (`unitCogs`) recognized during the original sale's batch consumption, distorting real-time Cost of Goods Sold (COGS) and gross margin analytics.
4. **Lack of Defective Item Isolation**: Damaged or defective items returned by customers were inadvertently restored directly into active sellable warehouse stock rather than being quarantined into a designated Defect / Salvage Warehouse (Brak ombori).
5. **Slow Manual Processing**: Warehouse managers inspecting physical returns lacked barcode scanning support to rapidly identify sold items from the customer invoice and increment returned quantities hands-free.
6. **Financial & Receivable Misalignment**: Customer accounts receivable (`Customer Debt`) and sales revenue were not adjusted automatically and atomically alongside warehouse stock intake, creating reconciliation discrepancies between warehouse receipts and accounting balances.

## Solution

A robust, full-stack Sales Returns (Mijozdan Qaytarish) management module fully integrated with sales invoicing, FIFO inventory batches, customer balances, and National Accounting Standards (BHMS/NAS):
1. **Strict Originating Invoice Binding**: Every Sales Return document is strictly linked to a valid, posted `SalesInvoice`. Item selections, original sale prices, discounts, and returnable quantity caps are automatically derived from the originating invoice.
2. **Rigid Over-Return Invariant**: System computes remaining returnable quantities (`returnableQty = originalQty - sum(confirmedReturnQty)`). Any attempt to return more than the remaining returnable quantity is blocked at both UI and backend validation layers.
3. **Historical FIFO Batch Cost Restoration**: When a return is confirmed/posted, goods are returned to inventory valuation at the exact historical unit landed cost (`unitCogs`) consumed during the original sale, crediting Cost of Goods Sold (Account 9110) and debiting Inventory (Account 2910) to accurately recalibrate Gross Profit.
4. **Line-Level Defect Isolation (Brak Ombori Routing)**: Operators can flag individual return items as defective (`isDefective: true`). Defective goods are automatically routed into an isolated Defect/Brak Warehouse, preventing them from mixing with active sellable stock while maintaining separate accounting valuation.
5. **Barcode Scanner Rapid Intake**: Warehouse operators can scan product barcodes; the system automatically matches the item against the selected originating invoice lines and increments the return quantity.
6. **Automated Counterparty Balance Adjustment**: Confirming a return atomically reduces customer debt (`Account 4010`). If the invoice was already paid in full, an unallocated customer credit balance (`Customer Advance`) is formed to settle future purchases or refund through finance cash payout vouchers.
7. **Document Lifecycle State Machine**: Controlled document lifecycle transitions (`DRAFT` → `POSTED` / `CANCELLED`) ensuring warehouse and financial adjustments only occur upon explicit confirmation.

## User Stories

1. As a sales manager, I want to open the "Mijozdan qaytarish" (Sales Returns) list view, so that I can see all past and draft customer return documents with their return numbers, dates, customer names, originating invoice links, totals, reasons, and statuses.
2. As a sales manager, I want to filter and search the Sales Returns list by document number, customer, status (`DRAFT`, `POSTED`, `CANCELLED`), date range, or warehouse, so that I can quickly locate specific return records.
3. As a sales manager, I want to click "Yangi qaytarish" (New Return) to launch a structured creation form, so that I can initiate a return request for a customer.
4. As a sales manager, I want to select a customer and choose one of their posted Sales Invoices from an active dropdown, so that the return is strictly bound to legitimate historical sales data.
5. As a sales manager, I want the system to automatically fetch all eligible line items, original sold quantities, previously returned quantities, and remaining returnable limits for the selected invoice, so that I don't have to manually look up prices or quantities.
6. As a sales manager, I want the system to block submission if any line item quantity exceeds the remaining returnable quantity (`over-return guardrail`), so that the company never accepts more returns than were sold.
7. As a sales manager, I want to select a standardized return reason (Brak, Expired, Incorrect Size/Item, Customer Rejection, Other) and enter optional descriptive notes, so that procurement and quality control teams understand why items were returned.
8. As a warehouse manager, I want to inspect returned items and flag defective or broken items (`isDefective: true`) at the line level, so that non-sellable stock is quarantined.
9. As a warehouse manager, I want defective items to be automatically received into the company's designated Defect Warehouse (Brak ombori) while non-defective items return to the main operational warehouse, so that damaged goods are never resold.
10. As a warehouse operator, I want to use a USB/Bluetooth barcode scanner to scan returned items, so that the form automatically identifies the product in the invoice lines and increments its returned count by 1.
11. As a warehouse manager, I want to save a return document as `DRAFT` while physical goods are being unloaded and inspected, so that progress is saved without prematurely altering stock or debt balances.
12. As a warehouse manager, I want to click "Tasdiqlash" (Confirm / Post) on a verified return document, so that physical stock is officially accepted into the warehouse and customer balances are adjusted in a single atomic transaction.
13. As an inventory manager, I want posted return items to be restocked using their exact historical landed cost (`unitCogs`) from the original batch consumption, so that inventory valuation is true to reality.
14. As an accountant, I want the system to automatically generate BHMS/NAS double-entry ledger records upon posting (Debit 2910 Inventory, Credit 9110 COGS; Debit 9010 Sales Revenue, Credit 4010 Customer Receivables), so that financial reports reflect correct trade margins and receivables without manual bookkeeping.
15. As an accountant, I want a customer's open debt to diminish by the total return amount, or create a customer advance balance if the invoice was already fully paid, so that the customer's settlement ledger is exact.
16. As a cashier, I want to see customer advance balances formed by returns when issuing cash payouts from the Finance module, so that cash refunds are tracked with proper cash expense vouchers (`FinanceTransaction`).
17. As a business owner, I want gross profit and sales analytics dashboards to reflect net sales (Gross Sales minus Returns) in real time, so that profit metrics are not inflated by returned merchandise.
18. As an administrator, I want to cancel an unposted draft return, or safely cancel a posted return (if the restocked items have not since been resold), so that operational mistakes can be rectified under strict audit logging.

## Implementation Decisions

### 1. Document Lifecycle & State Transitions
Sales Returns adopt a deterministic state model:
- `DRAFT`: The return document is prepared by a sales rep or warehouse clerk. Items and quantities are editable. No warehouse stock or financial balances are mutated.
- `POSTED`: The return is formally confirmed. Inventory stock increments (into Main Warehouse or Defect Warehouse per line), FIFO return batches are created, customer debt/advance is recalculated, and accounting journal entries are posted.
- `CANCELLED`: A draft is voided, or a posted return is reversed (provided the restocked items have not been consumed by subsequent sales).

### 2. Strict Originating Invoice Association & Over-Return Protection
- `invoiceId` is a required foreign key relation on the Sales Return document. Standalone returns without an invoice reference are disallowed.
- The API provides a dedicated endpoint (`GET /sales/invoices/:id/returnable-items`) returning each line item's:
  - `productId` & product metadata (name, SKU, barcode, unit)
  - `soldQuantity`: Quantity originally dispatched on the invoice
  - `returnedQuantity`: Sum of quantities already posted on prior returns for this invoice
  - `returnableQuantity`: `soldQuantity - returnedQuantity`
  - `unitPrice`: Actual selling price charged on the invoice (after item discounts)
  - `unitCogs`: Historical unit cost consumed from inventory batches
- Backend transaction rejects any request where `quantity > returnableQuantity` with an explicit `BadRequestException`.

### 3. Inventory Restocking & FIFO Batch Mechanics
- Returned items are restocked at the exact historical unit landed cost (`unitCogs`) recorded in the original sale's `BatchConsumption`.
- For each returned item, a new designated `ProductBatch` is instantiated:
  - `quantity`: Returned quantity
  - `remainingQuantity`: Returned quantity
  - `unitPrice`: Base purchase price from originating batch
  - `landedCost`: Original unit landed cost (`unitCogs`)
  - `batchNumber`: Standard return batch identifier (`RET-{returnNumber}-{productId}`)
- This guarantees full auditability and ensures that subsequent FIFO sales consume the restocked batch at the authentic landed cost.

### 4. Dual-Warehouse Defect Routing (Brak Ombori Isolation)
- `SalesReturnItem` contains an `isDefective: boolean` flag (default `false`).
- Each company/tenant can designate or have a system default Defect Warehouse (`isDefect: true` or named Brak Ombori).
- When `isDefective: false`, inventory stock is incremented in the primary return warehouse selected on the document header.
- When `isDefective: true`, inventory stock is incremented in the designated Defect Warehouse, isolating unusable items from active commercial sales.

### 5. Financial Settlement & Accounting Invariants
- Posting a Sales Return executes the following automated NAS/BHMS journal lines:
  1. **Revenue Reversal**: Debit 9010 (Sales Revenue) / Credit 4010 (Customer Receivables) for `totalAmount`
  2. **COGS Reversal**: Debit 2910 (Merchandise Inventory) / Credit 9110 (Cost of Goods Sold) for `totalCogs`
- Customer receivables are adjusted:
  - Open invoice debt is decreased by `totalAmount`.
  - If open debt reaches zero and excess return value exists, it is credited as `Customer Advance` (unallocated counterparty credit balance).
  - Physical cash/bank refunds are handled via the standard Finance module (`FinanceTransaction` EXPENSE linked to the counterparty), rather than mixing cash-drawer mutations into the inventory return document.

### 6. Barcode Scanner Fast-Input
- The frontend modal/drawer includes an active barcode input listener.
- Scanning an item's barcode checks the loaded invoice lines:
  - If found and `currentReturnQty < returnableQty`, it increments the return quantity by 1 and plays a subtle confirmation sound/visual flash.
  - If item exceeds returnable quantity or barcode does not exist on the invoice, an informative error alert is displayed.

## Testing Decisions

A good test exercises external observable behavior (REST API requests, database state consistency, and user interactions) without asserting internal implementation trivia.

### Test Scenarios & Suites
1. **Invoice Returnable Items Query**: Verify `GET /sales/invoices/:id/returnable-items` calculates correct remaining returnable quantities after partial returns.
2. **Draft Return Lifecycle**: Creating a return with status `DRAFT` persists document lines without changing warehouse stock or customer balances.
3. **Confirm & Post Return**: Confirming a draft executes atomic inventory restocking, batch creation at historical `unitCogs`, customer debt decrement, and journal entries.
4. **Over-Return Invariant**: Attempting to post a return with quantity exceeding `returnableQuantity` throws `BadRequestException`.
5. **Defective Item Routing**: Confirming a return with defective items routes those quantities into `defectWarehouseId` and non-defective items into `warehouseId`.
6. **Rollback Invariant**: Cancelling a posted return succeeds if goods are present, but fails if restocked items have already been consumed by subsequent sales.

### Prior Art
- `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts` (Section 4: Sales Returns at Historical Landed Cost — 6 dedicated invariant tests passing).
- `backend/src/modules/purchases/purchase-returns.spec.ts` (Purchase return rollback invariants).

## Out of Scope

- Supplier warranty claim workflows (handling defective returns back to the original manufacturer is covered under Purchase Returns).
- Mobile WMS camera-based barcode scanning (hardware USB/Bluetooth scanners supported via standard keyboard emulation).
- Automatic bank disbursement integration without cashier confirmation.

## Further Notes

- Primary keys use UUIDs (`String @id @default(uuid())`) and `sales_returns.invoice_id` is indexed.
- Frontend uses responsive Next.js 16 drawers and modal dialogs with full i18n support (`uz` / `ru`).
