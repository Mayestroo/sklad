# readyQty Denormalized onto SalesOrderItem

`SalesOrderItem.readyQty` is stored as a mutable column on the order item rather than computed on-the-fly by aggregating `ProductionOrder` records. The order list view (§18 of the TZ) shows ready/remaining quantities for every line of every visible order; computing that live would require joining through `production_orders` on every list render. Storing `readyQty` directly on the item makes the list query a single scan. The production service updates this column atomically whenever it records new output. `remainingQty` is never stored — it is always `quantity - readyQty` and computed at the application layer.

## Consequences

- The production service must be the sole writer of `SalesOrderItem.readyQty`; no other path may mutate it.
- If a `ProductionOrder` is cancelled and output is rolled back, the corresponding `readyQty` decrement must be applied in the same transaction.
