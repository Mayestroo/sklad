## Parent

Part of #12

## What to build

Operators with posting permission can post a purchase receipt ("Omborga kirim qilish"). Posting increases physical warehouse stock levels, generates distinct `ProductBatch` records with landed costs for FIFO valuation, updates supplier accounts payable debt, synchronizes catalog standard cost prices (`Product.costPrice`), and produces automated National Accounting Standards (BHMS) double-entry records behind the scenes. Enforces strict rollback invariants when unposting.

## Acceptance criteria

- [ ] Operator can post a `DRAFT` receipt, transitioning its document status to `POSTED` and recording `postedById` and `postedAt`.
- [ ] Physical stock levels (`StockLevel`) in the specified warehouse are incremented for all line items.
- [ ] Individual `ProductBatch` records are created for each item, capturing initial quantity, remaining quantity, purchase price, and calculated landed cost.
- [ ] Product catalog default cost price (`Product.costPrice`) is automatically synchronized to the latest posted unit price (ADR-0007).
- [ ] Supplier accounts payable (`Counterparty.debtBalance`) increases by the receipt's total amount in purchase currency.
- [ ] Automated BHMS double-entry journal entries are created: Debit 2910 (Inventory), Debit 4410 (Input VAT if applicable), and Credit 6010 (Accounts Payable) (ADR-0006).
- [ ] Unposting a receipt verifies rollback invariants (ADR-0004) and is blocked if stock has dropped below received quantity or if downstream payments/returns exist.
- [ ] Collapsible accounting audit view displays journal entries to users with Accountant or Admin roles.
- [ ] Comprehensive integration tests verify all posting and unposting invariants.

## Blocked by

- #14 (Purchases: Landed Cost Engine & Direct Ancillary Expenses Allocation)
