# Sales Order as a Separate Entity from Sales Invoice

`SalesOrder` (Zakaz) is modelled as a distinct entity with its own 13-state lifecycle rather than as an early-stage `SalesInvoice`. An order can live for days or weeks in production before any inventory moves or AR is created; merging it into `SalesInvoice` would force every pre-dispatch record through the COGS/batch-consumption machinery prematurely, corrupt the AR ledger, and make the clean `SalesDocStatus` enum unworkable. The `SalesInvoice` is created automatically — in the same database transaction as the warehouse dispatch — only when goods physically leave the warehouse.

## Considered Options

- **Extend `SalesInvoice` with pre-dispatch statuses** — rejected because `SalesInvoice` posting immediately deducts inventory and creates AR entries; deferring that deduction while keeping a "posted" invoice would require special-casing throughout the FIFO/COGS engine.
- **Separate `SalesOrder` entity** — chosen. Clean boundary: order lives in `sales_orders`, invoice lives in `sales_invoices`. On dispatch the service creates a posted `SalesInvoice` and links it back via `salesOrderId` on the invoice.
