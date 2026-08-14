## Parent

Part of #12

## What to build

Operators can process goods returned back to the supplier (`PurchaseReturn`) linked to an original posted purchase receipt. Creating and posting a return deducts stock from the warehouse, reduces the associated `ProductBatch` remaining quantity, adjusts the supplier's debt balance (or creates a supplier advance credit if already paid), and generates reversal BHMS double-entry journal records.

## Acceptance criteria

- [ ] Operator can create a purchase return linked to a posted receipt with return number, date, reason, and line items.
- [ ] Return line items validate that return quantities do not exceed unreturned receipt quantities.
- [ ] Posting a return deducts physical stock from the designated warehouse and decrements the specific `ProductBatch.remainingQty`.
- [ ] Supplier debt balance (`Counterparty.debtBalance`) is reduced by the return amount; if already fully settled, the return creates a `Supplier Advance` credit balance.
- [ ] Reversal BHMS journal entries are generated: Debit 6010 (Accounts Payable), Credit 2910 (Inventory), Credit 4410 (Input VAT adjustment if applicable).
- [ ] Purchase receipt's return status updates to `PARTIALLY_RETURNED` or `FULLY_RETURNED`.
- [ ] Purchase returns list and return detail views display complete return documents and reason codes.
- [ ] Automated integration tests verify stock reduction, batch decrement, and financial balance adjustment.

## Blocked by

- #15 (Purchases: Warehouse Posting, FIFO Product Batches & BHMS Postings)
