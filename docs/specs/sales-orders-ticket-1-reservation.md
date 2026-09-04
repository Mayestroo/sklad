# T1 — Automatic Stock Reservation on Sales Order Creation & Cancellation Rollback

**Parent:** #73
**GitHub Issue:** #74
**Status:** ready-for-agent
**Blocked by:** None — can start immediately.

## What to build
When a Sales Manager creates a Sales Order (`NEW`), automatically check available free stock and reserve the ordered items in `StockReservation` so other sellers cannot sell them. When an order is cancelled (`CANCELLED`), release all reservations atomically back to free stock. Include UI feedback in `SalesOrderForm` and invariant tests.

## Acceptance criteria
- [ ] Sales order creation atomically creates `StockReservation` records for requested items.
- [ ] If available free stock is insufficient, user receives a clear warning or validation error.
- [ ] Cancelling a sales order immediately releases all reserved quantities back to free stock.
- [ ] `SalesOrderForm` shows reserved stock status and alerts.
- [ ] Automated invariant tests pass for reservation on creation and release on cancellation.
