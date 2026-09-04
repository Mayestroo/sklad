## Parent
Part of #83

## What to build
Connect auto-pricing into Sales Order and Sales Invoice workflows with role-gated manual price override permissions.
- In `SalesOrderForm` and `SalesInvoiceForm`, picking a counterparty selects their mapped `priceListId` on the document header and recalculates product unit prices.
- Adding product lines auto-populates the resolved tier price.
- Users without `sales:override_price` permission have read-only price inputs.
- Users with permission can manually edit prices, and overrides are tracked in `AuditLog`.

## Acceptance criteria
- [ ] Selecting customer in Sales Order / Invoice forms updates priceListId and recalculates line prices
- [ ] Role permission `sales:override_price` controls whether price inputs are editable or disabled
- [ ] Dispatched orders retain agreed prices onto the auto-generated Sales Invoice

## Blocked by
- #86
