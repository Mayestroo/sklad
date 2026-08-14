# Sklad ERP Context

Sklad is an inventory, warehouse management, and trade ERP platform tailored for businesses in Uzbekistan, providing intuitive operational workflows while automating accounting, landed cost calculations, and financial settlements behind the scenes.

## Language

### Purchases & Inbound

**Purchase Receipt**:
A document recording goods acquired from a supplier and received into a single designated warehouse, establishing accounts payable and generating inventory batches.
_Avoid_: Purchase order, inbound invoice, admission sheet

**Purchase Expense**:
A direct ancillary cost (such as freight, customs duties, brokerage, or cargo handling) incurred to acquire goods and allocated to item landed costs.
_Avoid_: Overhead, indirect cost, operational expense

**Expense Allocation Method**:
The mathematical rule (`BY_AMOUNT`, `BY_QUANTITY`, `BY_WEIGHT`) used to distribute a purchase expense across items in a purchase receipt.
_Avoid_: Expense division, cost split, sharing formula

**Landed Cost**:
The total unit or line cost of inventory including the base supplier purchase price and allocated direct purchase expenses (plus non-deductible VAT for non-VAT-paying entities).
_Avoid_: Prime cost, net price, base purchase cost

**Product Batch**:
A specific tracking record created upon posting a purchase receipt, maintaining the remaining quantity, original purchase price, and landed cost for FIFO/weighted valuation.
_Avoid_: Lot, serial group, shipment pack

**Purchase Return**:
A document recording the return of previously received goods back to the supplier, deducting inventory quantity from the warehouse and reducing supplier debt or generating supplier credit.
_Avoid_: Debit memo, outbound return, vendor refund slip

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
