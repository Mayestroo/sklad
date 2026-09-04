# Sklad ERP Context

Sklad is an inventory, warehouse management, and trade ERP platform tailored for businesses in Uzbekistan, providing intuitive operational workflows while automating accounting, landed cost calculations, and financial settlements behind the scenes.

## Language

### Purchases & Inbound

**Purchase Receipt**:
A document recording goods acquired from a supplier and received into a single designated warehouse, establishing accounts payable and generating inventory batches.
_Avoid_: Purchase order, inbound invoice, admission sheet

**Purchase Expense / Additional Expense**:
A direct ancillary cost (such as freight, customs duties, brokerage, or cargo handling) incurred to acquire goods and allocated to item landed costs. Can be recorded either within a draft purchase receipt or as a standalone Additional Expense document linked to a posted receipt.
_Avoid_: Overhead, indirect cost, operational expense

**Additional Expense Document**:
A standalone operational document recording ancillary acquisition expenses with its own document lifecycle, counterparty, currency, and line allocations, capable of updating landed cost for both draft and posted purchase receipts.
_Avoid_: Expense voucher, cost adjustment slip, freight bill

**Retroactive COGS Revaluation**:
The automatic recalibration of historical cost of goods sold (`unitCogs`, `lineCogs`, `grossProfit`) and linked general ledger entries on sales invoices that consumed batches whose landed cost increased after the sale occurred.
_Avoid_: Historical overwrite, manual cogs fix, profit override

**Expense Allocation Method**:
The mathematical rule (`BY_AMOUNT`, `BY_QUANTITY`, `BY_WEIGHT`) used to distribute a purchase expense across items in a purchase receipt.
_Avoid_: Expense division, cost split, sharing formula

**Landed Cost**:
The total unit or line cost of inventory including the base supplier purchase price and allocated direct purchase expenses (plus non-deductible VAT for non-VAT-paying entities).
_Avoid_: Prime cost, net price, base purchase cost

**Product Batch**:
A specific tracking record created upon posting a purchase receipt, maintaining the remaining quantity, original purchase price, and landed cost for FIFO/weighted valuation.
_Avoid_: Lot, serial group, shipment pack

**Batch Consumption**:
An audit and ledger record tracking the exact quantity and unit cost consumed from a specific product batch by an outbound sales invoice line, enabling exact historical tracing and retroactive COGS recalibration.
_Avoid_: Batch reduction, stock eating, FIFO deduction record

**Allocation Remainder Rule**:
The deterministic rounding convention assigning fractional penny or tiyin remainders from expense division to the highest-value line item so the sum of allocated expenses exactly equals the total expense document amount.
_Avoid_: Penny adjustment, rounding drift, fractional balance drop

**Purchase Return**:
A document recording the return of previously received goods back to the supplier, deducting inventory quantity from the warehouse and reducing supplier debt or generating supplier credit.
_Avoid_: Debit memo, outbound return, vendor refund slip

**Landed Cost Return Variance**:
The non-refundable expense difference recognized when returning inventory whose unit landed cost exceeded the supplier base purchase price (due to allocated freight, customs, or brokerage), credited from inventory asset (2910) and expensed without altering the supplier's payable balance.
_Avoid_: Inventory write-off, return loss penalty, supplier over-charge

**Return Quantity Invariant**:
The safety validation ensuring that item returned quantity cannot exceed the minimum of unreturned receipt quantity, remaining batch quantity, and active warehouse stock.
_Avoid_: Over-return, negative batch balance, sold-item return

**Rollback Invariant**:
The safety rule disallowing the unposting or cancellation of a posted purchase receipt if linked payments exist or if warehouse stock has dropped below received quantities due to sales.
_Avoid_: Document unlock, forced unpost, stock override

**Quick-Add Modal**:
An inline creation dialog enabling operators to create new products, categories, or counterparties directly within the purchase receipt creation workflow without leaving the page.
_Avoid_: Context switch, background registration, external entity setup

**Nomenclature Item Type**:
The classification of an item in the unified catalog as either a finished good (`PRODUCT`), raw material or industrial input (`RAW_MATERIAL`), or service (`SERVICE`).
_Avoid_: Stock category, item status, billing tag

**Raw Material Inbound**:
Inbound processing of raw materials (`RAW_MATERIAL`) within a purchase receipt, increasing warehouse stock and establishing FIFO batches under National Accounting Standards Account 1010 (Materials & Supplies) rather than merchandise Account 2910.
_Avoid_: Production intake, factory receipt, direct charging

**Service Purchase Inbound**:
The recording of services (`SERVICE`) directly on a purchase receipt, debiting operational expense accounts (such as 9420/9430) and crediting supplier payable (6010) without incrementing warehouse stock levels or creating inventory batches.
_Avoid_: Non-stock receipt, virtual inbound, intangible intake


### Orders & Fulfillment

**Sales Order (Zakaz)**:
A confirmed customer commitment to purchase goods, with its own 13-state lifecycle. A Sales Order is not a sale — it does not move inventory or create accounts receivable. It coordinates production, payment collection, and warehouse dispatch. A Sales Order converts to a Sales Invoice automatically when the warehouse posts an outbound dispatch.
_Avoid_: Pre-invoice, draft sale, pro-forma

**Sales Order Status**:
One of 13 states a Sales Order passes through: `NEW` → `PENDING_APPROVAL` → `APPROVED` → `SENT_TO_PRODUCTION` → `IN_PRODUCTION` → `PARTIALLY_READY` → `READY` → `AWAITING_PAYMENT` → `PAYMENT_CONFIRMED` → `READY_TO_SHIP` → `SHIPPED` → `COMPLETED` | `CANCELLED`. Transitions are either manual (role-gated) or automatic (triggered by production, finance, or warehouse events).
_Avoid_: Order phase, order stage, pipeline step

**Payment Condition**:
The rule governing when the warehouse dispatch gate is unlocked for a Sales Order. One of three values: `PREPAID_100` (dispatch blocked until 100% of `totalAmount` is paid), `PARTIAL` (dispatch unlocked once `paidAmount ≥ totalAmount × requiredPaymentPercent`), or `CREDIT` (dispatch gate bypassed entirely; goods ship regardless of payment status).
_Avoid_: Payment terms, credit terms, billing mode

**Dispatch Gate**:
The system-enforced block preventing warehouse staff from posting an OUTBOUND inventory document against a Sales Order until its Payment Condition is satisfied. For `PREPAID_100` and `PARTIAL` orders, the gate checks `paidAmount` at the moment of dispatch. For `CREDIT` orders, no check is performed.
_Avoid_: Release lock, payment block, shipment hold

**Production Order (stub)**:
A lightweight task record automatically created when a Sales Order is sent to production. Tracks `requiredQty`, `readyQty`, and `status` (`PENDING` / `IN_PROGRESS` / `DONE` / `CANCELLED`) for a single product line within an order. The full production workflow (steps, materials, BOM) is a separate future module; this stub is the minimum interface between the Orders and Production contexts.
_Avoid_: Manufacturing order, work order, production task

**Order Payment**:
A `Payment` record linked to a `SalesOrder` via `orderId` (rather than `invoiceId`). Represents money received from a customer before the order has been dispatched and converted to a Sales Invoice. Order Payments accumulate in `paidAmount` on the Sales Order and determine whether the Dispatch Gate is satisfied. After dispatch, they are not re-linked to the resulting Sales Invoice; the invoice's `paidAmount` is computed by summing all payments referencing the originating order.
_Avoid_: Advance payment, deposit, pre-payment allocation

**Pick List (Yig'uv varaqasi)**:
An internal operational document printed for warehouse staff during order preparation (`PROCESSING`), itemizing products, SKU, barcodes, units of measure, and quantities to pick while omitting commercial selling prices and discounts.
_Avoid_: Picking slip, sborshik list, draft delivery note

**Delivery Note (Yuk xati / Nakladnaya)**:
The formal commercial shipping document printed upon outbound dispatch (`SHIPPED`), itemizing fulfilled products, agreed unit prices, discounts, total sums, VAT, and official signature blocks for warehouse dispatchers and transport couriers.
_Avoid_: Waybill, shipment bill, bill of lading

**Automatic Stock Reservation**:
The instantaneous locking of available warehouse inventory upon creating a `SalesOrder` (`NEW`), preventing double-selling while keeping physical stock balances and accounting ledgers intact until explicit dispatch.
_Avoid_: Inventory freeze, manual hold, virtual deduction

### Sales & Outbound

**Sales Invoice**:
A document recording the sale of goods to a customer from a single designated warehouse, establishing customer accounts receivable, consuming inventory batches via FIFO, and calculating real-time COGS and gross profit.
_Avoid_: Sales order, bill of sale, outbound invoice

**Gross Profit**:
The operational trade margin calculated as Net Sales Revenue (excluding output VAT) minus the actual Cost of Goods Sold (`totalCogs`) consumed from inventory batches.
_Avoid_: Mark-up profit, raw turnover, sales spread

**Below-Cost Guardrail**:
The real-time safety alert and role-permission gate preventing the sale of products below their unit landed cost without explicit managerial authorization.
_Avoid_: Margin alert, discount stop, price restriction

**Sales Return**:
A document recording the return of previously sold goods from a customer back into the warehouse, restoring active stock at the original consumption landed cost, reducing customer debt or generating customer advance, and adjusting accounting revenue and COGS.
_Avoid_: Customer refund slip, inbound return, reverse invoice

**Over-Return Invariant**:
The safety validation ensuring that item returned quantity cannot exceed the unreturned sold quantity of the originating sales invoice.
_Avoid_: Excess return, unverified quantity return, phantom stock intake

**Defect Warehouse (Brak ombori)**:
A designated warehouse used to quarantine defective, damaged, or expired returned goods, isolating them from active sellable inventory while maintaining separate accounting valuation.
_Avoid_: Bad pile, junk bin, broken stock

**Sales Rollback Invariant**:
The safety rule disallowing the unposting or cancellation of a posted sales invoice if linked finance payments exist or if sales returns have been registered against it.
_Avoid_: Force cancel, cash bypass, invoice unlock

### Counterparties & Balances

**Supplier Debt**:
The accounts payable obligation owed to a supplier in the purchase currency, created upon posting a purchase receipt and diminished by payments or returns.
_Avoid_: Vendor credit, accounts payable liability, unpaid bill balance

**Supplier Advance**:
A credit balance or overpayment held with a supplier resulting from advance payments or returns of already-settled purchases, applicable to future receipts.
_Avoid_: Prepayment liability, negative debt, deposit fund

**Customer Debt**:
The accounts receivable obligation owed by a customer in the sales currency, created upon posting a sales invoice and diminished by finance payments or sales returns.
_Avoid_: Buyer liability, customer balance, unpaid bill balance

**Customer Advance**:
An unallocated credit balance held on behalf of a customer resulting from advance payments or returns exceeding open debt, applicable toward future sales.
_Avoid_: Customer credit deposit, buyer prepay, negative receivable

**Payment Allocation**:
The direct or FIFO-based distribution of customer finance income transactions to settle outstanding sales invoices and diminish customer debt.
_Avoid_: Debt erase, money clearing, manual match

**Exchange Difference**:
The financial variance recognized between the operational document exchange rate and the settlement payment exchange rate for multi-currency transactions.
_Avoid_: Currency slippage, revaluation loss, FX fee

**Counterparty Net Balance**:
The enterprise's net financial settlement position with a counterparty (`Receivables - Payables`). A positive balance (`+`, green) denotes counterparty indebtedness to the enterprise (Debitor / Haqdorligimiz). A negative balance (`-`, red) denotes the enterprise's indebtedness to the counterparty (Kreditor / Qarzdorligimiz). A zero balance denotes a settled account.
_Avoid_: Raw debt balance, unsigned debt, mixed ledger total

**Receivables & Payables Summary**:
The real-time tenant-level financial aggregation of counterparty settlement states, reporting total customer and supplier counts alongside segregated aggregate figures for receivables (`debtBalance > 0`) and payables (`debtBalance < 0`).
_Avoid_: Debt pile, lumped liability, generic debtor sum
### Services & Accruals

**Service Act (Xizmatlar dalolatnomasi / akti)**:
An operational document recording intangible services either rendered to a customer (`PROVIDED`) or received from a vendor (`RECEIVED`), establishing accounts receivable or payable (accrual) and national accounting journal entries without initiating cash or bank transactions.
_Avoid_: Service invoice, labor slip, cash service bill, work completion note

**Service Accrual (Xizmat hisob-kitobi)**:
The formal recognition of revenue/expense and counterparty debt obligation at the moment a Service Act is posted, completely decoupled from the timing of physical cash settlement.
_Avoid_: Cash-basis fee, payment record, advance deduction

**Separation of Concerns (Services vs. Finance)**:
The core architectural boundary establishing that the Services module solely records performance acts, quantities, units, and debt accruals, while all physical money inflows, outflows, and reconciliation are strictly managed by the Finance module.
_Avoid_: In-module checkout, direct cash act, service cashbox

**Service Rollback Invariant**:
The safety rule disallowing the cancellation or deletion of a posted Service Act if linked financial transactions (`FinanceTransaction`) or partial payments exist.
_Avoid_: Orphan payment unlink, forced service delete, silent de-reconciliation

### Accounting & General Ledger

**Automatic Journal Posting**:
The automated creation of National Accounting Standards (BHMS/NAS) double-entry records (e.g. Debit 2910, Debit 4410, Credit 6010 for purchases; Debit 4010, Credit 9010, Debit 9110, Credit 2910 for sales) triggered by operational document status changes without manual user accounting intervention.
_Avoid_: Manual debit-credit, voucher posting, provodka input

## Frontend Conventions

### Currency Display

**`formatCurrency(amount, locale, currency)`** always returns the formatted number with the currency code already appended (e.g. `"1 500 000 UZS"`). Never add a separate `{currency}` expression after calling it — doing so produces `"1 500 000 UZS UZS"`.

```tsx
// ✅ Correct
{formatCurrency(amount, locale, currency)}

// ❌ Wrong — renders "1 500 000 UZS UZS"
{formatCurrency(amount, locale, currency)} {currency}
```

**`CURRENCY_OPTIONS`** is the single source of truth for currency select options across the entire frontend. Import it from `@/lib/utils`; never define an inline array. Currency labels must be bare ISO codes (`UZS`, `USD`) — no parenthetical additions like `(So'm)` or `($)`.

```tsx
import { CURRENCY_OPTIONS } from '@/lib/utils';
// ...
<Select options={CURRENCY_OPTIONS} />
```
