# 0018: Sales Orders Warehouse Workflow & One-Click Dispatch

## Context

In high-volume wholesale and distribution trade, sales managers register commitments while warehouse personnel manage physical preparation and transport loading. Disconnecting these workflows previously caused inventory discrepancies, double-booking of stock, and high manual overhead when converting orders into sales invoices.

## Decision

1. **Automatic Stock Reservation on Order Creation**:
   When a Sales Order is created in `NEW` status, the system immediately locks requested inventory into `StockReservation` against the designated warehouse. `Physical Stock` remains untouched, but `Free Stock` is decremented atomically so other sellers cannot sell reserved goods. If an order is cancelled, all reservations are immediately returned to the pool of free stock.

2. **Warehouse Operational State Machine**:
   The lifecycle incorporates explicit warehouse stages:
   `NEW` $\to$ `ACCEPTED` $\to$ `PROCESSING` $\to$ `READY_FOR_SHIPMENT` $\to$ `SHIPPED` | `CANCELLED`.
   Transitions are role-gated: only users with `WAREHOUSE`, `WAREHOUSE_MANAGER`, or `ADMIN` roles can advance warehouse stages.

3. **One-Click Dispatch (Avto-Otgruzka)**:
   Transitioning an order to `SHIPPED` or clicking dispatch executes an atomic ACID transaction that:
   - Creates and posts a `SalesInvoice` with `salesOrderId` referencing the order.
   - Deducts warehouse `ProductBatch` records using FIFO costing.
   - Consumes the linked `StockReservation`.
   - Records customer accounts receivable (`Counterparty.debtBalance`).
   - Updates order item shipped quantities and sets status to `SHIPPED`.

4. **Warehouse Operational Printing**:
   - **Pick List (Yig'uv varaqasi)**: Generated during `PROCESSING` for warehouse pickers; itemizes SKU, barcode, unit, and required quantity while hiding commercial sales prices.
   - **Delivery Note (Yuk xati / Nakladnaya)**: Commercial shipping document generated upon `SHIPPED` for couriers and drivers, showing itemized prices, total sums, VAT, and official signature blocks.

## Consequences

- Warehouse operators can fulfill orders in 1 click directly from the orders table dropdown without manual invoice creation.
- Physical inventory and general ledger accounts receivable remain strictly consistent with physical goods movements.
