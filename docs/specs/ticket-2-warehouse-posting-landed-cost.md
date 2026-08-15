## Parent

Part of #34 (Spec) / Part of #35 (Map)

## What to build

Operators can post an additional expense against unsold inventory batches to officially capitalize ancillary costs onto stock valuation, establish financial settlements, and generate general ledger entries:
1. **Warehouse Batch Landed Cost Mutation**: Posting mutates the `landedCost` of the target `ProductBatch` associated with the purchase receipt line items.
2. **Product Catalog Cost Price Sync (ADR 0007)**: Automatically updates `Product.costPrice` for all affected products to match the newly established unit landed cost.
3. **Financial Settlement Integration**: If marked as paid on the spot with a cash account, verifies cash balance, deducts from `CashAccount`, and creates a `FinanceTransaction` (`EXPENSE`); otherwise, increases accounts payable debt on `Counterparty.debtBalance`.
4. **Automated Double-Entry BHMS Journal Postings (ADR 0006)**: Automatically generates balanced journal entries (Debit 2910 Inventory / Goods, Debit 4410 Input VAT if applicable, Credit 6010 Accounts Payable / Credit 5010 Cash) without manual accounting input.
5. **Frontend UI Posting & Statuses**: Action button on `/purchases/expenses/new` and `/purchases/expenses/[id]` to post the document, transitioning status from `DRAFT` to `POSTED`, updating UI badges, and locking inputs.
6. **Integration Tests**: Tests verifying batch cost mutations, catalog price synchronization, cash/debt settlements, and double-entry journal balance.

## Acceptance criteria

- [ ] Posting an expense updates `ProductBatch.landedCost` for all selected items.
- [ ] Product catalog `Product.costPrice` is synchronized with the new landed cost per ADR 0007.
- [ ] Cash payment deducts cash account balance and logs an expense transaction; credit payment increases supplier debt.
- [ ] Balanced BHMS journal lines (Debits 2910/4410, Credits 6010/5010) are posted automatically.
- [ ] Document status transitions to `POSTED` and form fields are locked from accidental edits.
- [ ] Automated tests verify transactional integrity across all financial and inventory updates.

## Blocked by

- #36 (Ticket 1)
