# Auto-create Sales Invoice on Warehouse Dispatch

When the warehouse posts an OUTBOUND `InventoryDocument` against a `SalesOrder`, the system automatically creates and posts a `SalesInvoice` in the same database transaction. We chose automation over a manual "Convert to Invoice" button because inventory must leave the ledger the instant goods leave the warehouse — a human delay between dispatch and invoice creation would produce a window where stock is physically gone but still visible in reports. The `SalesInvoice` carries a `salesOrderId` FK back to the originating order so the full audit trail is preserved.

## Consequences

- Partial shipment (dispatching less than the full order quantity) is explicitly deferred to a future iteration. For MVP, one dispatch = one invoice = order done.
- The warehouse operator cannot dispatch without the system having write access to `sales_invoices`; the warehouse service must call the sales-invoice service within the same transaction or use a saga if they diverge into separate services later.
