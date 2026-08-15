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

### Counterparties & Balances

**Supplier Debt**:
The accounts payable obligation owed to a supplier in the purchase currency, created upon posting a purchase receipt and diminished by payments or returns.
_Avoid_: Vendor credit, accounts payable liability, unpaid bill balance

**Supplier Advance**:
A credit balance or overpayment held with a supplier resulting from advance payments or returns of already-settled purchases, applicable to future receipts.
_Avoid_: Prepayment liability, negative debt, deposit fund

**Exchange Difference**:
The financial variance recognized between the purchase invoice exchange rate and the settlement payment exchange rate for multi-currency transactions.
_Avoid_: Currency slippage, revaluation loss, FX fee

### Accounting & General Ledger

**Automatic Journal Posting**:
The automated creation of National Accounting Standards (BHMS/NAS) double-entry records (e.g. Debit 2910, Debit 4410, Credit 6010) triggered by operational document status changes without manual user accounting intervention.
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
