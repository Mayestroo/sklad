## Parent

Part of #34 (Spec) / Part of #35 (Map)

## What to build

Enable retroactive cost of goods sold (COGS) and gross profit recalibration when an additional expense is posted against inventory that has already been partially or fully sold (ADR 0008):
1. **Batch Consumption Audit Model**: Create `BatchConsumption` model tracking `salesInvoiceItemId`, `batchId`, `quantity`, `unitCost`, and `createdAt`. Update sales invoice posting logic to automatically record batch consumption records when stock is deducted via FIFO.
2. **Proportional Cost Split**: The allocation engine splits additional expenses between unsold warehouse stock and historically dispatched sales based on `remainingQty` vs consumed quantities.
3. **Retroactive COGS Recalibration Engine**: When posting an expense, the engine discovers all linked `BatchConsumption` records, calculates the incremental unit cost, increments `SalesInvoiceItem.unitCogs` and `lineCogs`, recalculates `lineGrossProfit`, and updates parent `SalesInvoice.totalCogs` and `grossProfit`.
4. **Downstream Accounting Adjustments**: Generates journal entries debiting 9110 (Cost of goods sold) for the dispatched portion and debiting 2910 (Inventory) for the remaining warehouse portion.
5. **Frontend Retroactive Impact Card**: Displays a dedicated "Retroactive Sales Impact" section in `/purchases/expenses/[id]` showing affected sales invoices, customer names, dispatched quantities, previous COGS, new COGS, and profit margin deltas.
6. **Invariant Tests**: Comprehensive tests verifying exact mathematical COGS recalibration when 0%, 50%, or 100% of stock has been sold prior to expense posting.

## Acceptance criteria

- [ ] Sales invoice posting populates `BatchConsumption` records.
- [ ] Posting an expense on partially sold stock proportionally updates remaining batch `landedCost` and historical `SalesInvoiceItem` COGS.
- [ ] `SalesInvoice` total COGS and gross profit figures are retroactively updated.
- [ ] Adjusting journal entries correctly divide between 2910 (warehouse stock) and 9110 (sold COGS).
- [ ] `/purchases/expenses/[id]` displays the table of affected sales invoices and margin deltas.
- [ ] Invariant tests verify mathematical precision of the retroactive split.

## Blocked by

- #37 (Ticket 2)
