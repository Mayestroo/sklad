# Order-linked Payments via the Existing Payment Model

Pre-dispatch payments against a `SalesOrder` are recorded by adding an optional `orderId` column to the existing `Payment` model rather than creating a separate `OrderPayment` table. The alternative — a dedicated table — would have duplicated Finance's reporting queries, split payment history across two sources, and required a merge step when the order converts to an invoice. With a single `Payment` table, a payment row holds either `invoiceId` (post-dispatch) or `orderId` (pre-dispatch), never both. Finance's existing allocation and reporting code requires minimal change.

## Constraints

- A `Payment` row must have exactly one of `invoiceId` or `orderId` set; a database check constraint enforces this.
- When the `SalesOrder` is converted to a `SalesInvoice` on dispatch, existing order payments are **not** re-linked to the invoice. The invoice's `paidAmount` is recomputed by summing all payments where `orderId = salesOrder.id` plus any post-dispatch `invoiceId` payments. This keeps the payment history immutable.
