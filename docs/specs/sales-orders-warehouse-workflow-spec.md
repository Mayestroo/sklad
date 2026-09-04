# Specification: Sales Orders & Warehouse Dispatch Workflow Integration

## Problem Statement

In fast-paced wholesale, distribution, and retail trade operations, sales managers take orders while warehouse staff pack and dispatch goods. Previously:
1. **Overselling & Inventory Ambiguity**: When a sales manager agreed on an order with a customer, goods were not immediately locked in warehouse inventory, allowing other sellers to sell the same items before dispatch.
2. **Premature Stock Deduction or Accounting Distortion**: If sellers created direct sales invoices upfront to "hold" goods, inventory and accounts receivable were posted before goods physically existed or left the warehouse, distorting balance sheets and tax reports.
3. **High Operational Friction for Warehouse Operators**: Fulfilling an order required opening multiple separate pages, creating a manual sales invoice from scratch, and matching items line by line. Warehouse managers lacked a fast in-table status workflow to progress orders from acceptance to shipment in one click.
4. **Missing Warehouse Documentation**: Warehouse pickers had no dedicated "Pick List" (Yig'uv varaqasi) showing items, quantities, and locations without pricing, and dispatchers lacked an immediate standard "Delivery Note" (Yuk xati / Nakladnaya) upon handing over goods to couriers or drivers.

## Solution

A tightly integrated two-tier role workflow between Sales (Sales Manager) and Fulfillment (Warehouse Manager):
1. **Separation of Commitments and Deliveries**: Sales Managers operate in `SalesOrder` (Zakazlar), committing orders and atomically placing goods into `StockReservation` (bron) so physical stock remains untouched while free stock is protected against double-selling.
2. **Unified Order Lifecycle State Machine**:
   - `NEW`: Order created by seller; items automatically reserved from warehouse stock.
   - `ACCEPTED`: Warehouse manager confirms and accepts the order.
   - `PROCESSING`: Warehouse staff actively pick and pack the order.
   - `READY_FOR_SHIPMENT`: Packaged and staged for vehicle loading or courier handover.
   - `SHIPPED`: 1-click dispatch automatically generates and posts a `SalesInvoice`, executes FIFO batch inventory deduction, consumes reservations, and records customer accounts receivable.
   - `CANCELLED`: Order cancelled; all reserved items immediately returned to available free stock.
3. **One-Click Dispatch (Avto-Otgruzka)**: Transitioning to `SHIPPED` or clicking "Sotuv qilish" automatically creates a posted `SalesInvoice` linked via `salesOrderId`, eliminating duplicate data entry.
4. **Warehouse Quick-Action Dashboard & In-Table Status Switcher**: Warehouse managers can advance order statuses directly from the orders table dropdown without opening the full document editor.
5. **Standardized Printing Modals**:
   - **Pick List (Yig'uv varaqasi)**: Operational internal picking slip (Item, SKU, Quantity, Unit, Barcode; no commercial prices).
   - **Delivery Note (Yuk xati / Nakladnaya)**: Formal commercial shipping slip (Customer, Items, Quantities, Unit Prices, Total Sum, VAT, Handover & Acceptance Signatures).

## User Stories

1. As a sales manager, I want to create a new Sales Order by selecting a customer, delivery address, warehouse, and line items, so that customer purchase commitments are documented.
2. As a sales manager, I want the system to automatically reserve requested item quantities upon order creation (`NEW`), so that other sellers cannot accidentally sell those items to other customers.
3. As a sales manager, I want the system to warn me if requested item quantities exceed available warehouse stock, so that I do not over-promise goods to customers.
4. As a sales manager, I want to see the real-time fulfillment status of my orders (`ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`, `SHIPPED`), so that I can provide accurate updates to my clients.
5. As a sales manager, I want to cancel an unfulfilled order, so that all reserved inventory is immediately released back into the pool of free stock.
6. As a warehouse manager, I want to view a dedicated queue of incoming Sales Orders sorted by creation date and priority, so that I can organize daily picking schedules.
7. As a warehouse manager, I want to change an order status from `NEW` to `ACCEPTED` directly from the orders table dropdown, so that the sales team knows the warehouse has acknowledged the order.
8. As a warehouse manager, I want to transition an order to `PROCESSING`, so that picking staff know the order is currently being gathered on the warehouse floor.
9. As a warehouse manager, I want to print a Pick List (Yig'uv varaqasi) for a `PROCESSING` order, so that warehouse pickers have a physical checklist of items and quantities without exposing commercial prices.
10. As a warehouse manager, I want to advance an order to `READY_FOR_SHIPMENT`, so that logistics and drivers know goods are boxed, labeled, and staged at the dispatch dock.
11. As a warehouse manager, I want to transition an order to `SHIPPED` in one click from the table or order details, so that goods are formally dispatched without manual invoice creation.
12. As a warehouse manager, I want the system to automatically create and post a `SalesInvoice` when I mark an order as `SHIPPED`, so that warehouse inventory is deducted using FIFO batches.
13. As a warehouse manager, I want the automatic dispatch to release and consume the order's stock reservation atomically, so that inventory balances remain strictly consistent.
14. As a warehouse manager, I want to print an official Delivery Note (Yuk xati / Nakladnaya) immediately upon dispatch, so that the driver carries valid shipping documentation with signature spaces for handover.
15. As a finance officer, I want the automatic `SalesInvoice` generated upon shipment to debit customer receivables (Account 4010) and credit revenue (Account 9010), so that accounting ledgers reflect real sales atomically.
16. As a warehouse operator, I want the system to block dispatch if physical stock has become unavailable or corrupted before shipping, so that the warehouse never registers negative stock.
17. As an administrator, I want an immutable audit log recorded whenever an order status changes or a sales invoice is auto-generated, so that full accountability between Sales and Warehouse is preserved.

## Implementation Decisions

### 1. State Machine & Lifecycle Alignment
The Sales Order lifecycle adopts the 6-stage operational state machine:
```
NEW ──► ACCEPTED ──► PROCESSING ──► READY_FOR_SHIPMENT ──► SHIPPED
 │          │            │                  │
 └──────────┴────────────┴──────────────────┴─────────────► CANCELLED
```
- Existing database relations (`SalesOrder`, `SalesOrderItem`, `SalesInvoice`, `StockReservation`) are preserved.
- `SalesOrderStatus` enum includes: `NEW`, `ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`, `SHIPPED`, `CANCELLED` (with backward-compatible transitions from legacy stubs).

### 2. Immediate Stock Reservation on Creation
- When an order is saved in `NEW` status, `StockReservationService.reserveStockForOrder()` is invoked within the database transaction.
- If physical available stock is less than requested quantity, the system either allocates available free stock or flags a warning based on tenant inventory policy.
- When an order transitions to `CANCELLED`, `StockReservationService.releaseOrderReservations()` is invoked, freeing all reserved units.

### 3. One-Click Dispatch & Auto-Invoice Transaction
- Triggering `SHIPPED` invokes `SalesOrdersService.dispatchSalesOrder()`.
- Within a single ACID database transaction:
  1. Generates the next sequential invoice number (`INV-YYYY-XXXX`).
  2. Creates a `SalesInvoice` with `salesOrderId` referencing the order, copying line items, agreed prices, currency, and discounts.
  3. Deducts warehouse FIFO `ProductBatch` records and creates `BatchConsumption` tracking entries.
  4. Updates `StockLevel` physical quantities.
  5. Consumes linked `StockReservation` rows.
  6. Increments `Counterparty.debtBalance` by invoice total.
  7. Updates `SalesOrder.status` to `SHIPPED` and `SalesOrderItem.shippedQty`.
  8. Posts the `SalesInvoice` (`POSTED`).

### 4. Status Switcher API & Role Guarding
- Endpoint: `PATCH /api/sales/orders/:id/status` (or `POST /api/sales/orders/:id/transition`).
- Roles:
  - `SELLER`: Can create `NEW`, edit draft, and request cancellation.
  - `WAREHOUSE` / `WAREHOUSE_MANAGER`: Can transition `NEW` $\to$ `ACCEPTED` $\to$ `PROCESSING` $\to$ `READY_FOR_SHIPMENT` $\to$ `SHIPPED`.
  - `ADMIN` / `MANAGER`: Full transition and cancellation rights across all stages.

### 5. Frontend UI: Quick Status Dropdown & Print Templates
- **In-Table Status Dropdown**: Located in the Sales Orders list page. Displays current status badge with a role-gated dropdown allowing 1-click updates to next allowed statuses.
- **Pick List Modal (Yig'uv varaqasi)**:
  - Header: Order #, Order Date, Warehouse, Assigned Seller.
  - Table: Item Name, SKU/Barcode, Unit of Measure, Required Quantity, Packed Quantity checkbox.
  - Footer: Prepared By (Picker Signature), Date/Time.
  - No commercial prices or totals rendered.
- **Delivery Note Modal (Yuk xati / Nakladnaya)**:
  - Header: Order # & Linked Invoice #, Date, Seller Company Details, Customer Details, Warehouse.
  - Table: Item Name, Unit, Quantity, Unit Price, Discount, Total Price.
  - Summary: Total Amount in words and figures.
  - Footer: Released By (Omborchi) signature block, Received By (Mijoz / Haydovchi) signature block.

## Testing Decisions

### Test Seam: Service & API Integration Layer
The primary testing seam is the backend Service Integration layer (`SalesOrdersService` combined with Prisma transactions and `StockReservationService`):
- **Why this seam?** It validates real end-to-end business invariants: stock balance deduction, reservation release, FIFO cost calculation, and transaction rollback on error without relying on fragile UI dom selectors.

### Good Test Criteria:
1. **Creation & Reservation Invariant**: Creating an order in `NEW` status must increase `reservedStock` and decrease `freeStock` by order quantity, leaving `physicalStock` unchanged.
2. **Order Cancellation Invariant**: Cancelling an order in any pre-shipped status must release 100% of reserved stock, restoring `freeStock`.
3. **Dispatch & Invoice Atomicity**: Transitioning to `SHIPPED` must create a posted `SalesInvoice`, decrement `physicalStock`, consume reservations, increment customer debt, and set order status to `SHIPPED`.
4. **Insufficiency Guard**: Attempting to transition to `SHIPPED` when physical warehouse stock has been depleted must throw a `BadRequestException` and abort without creating orphan invoices.
5. **Role Permission Guard**: A user with only `SELLER` role attempting to trigger `SHIPPED` must receive a `ForbiddenException`.

### Prior Art
- `backend/src/modules/sales/orders/sales-orders.service.spec.ts` (Existing Sales Order service unit & integration tests).
- `backend/src/modules/purchases/purchase-invariant.spec.ts` (Inventory batch posting & rollback invariant test suites).

## Out of Scope

- Barcode scanner mobile app integration (WMS hardware barcode scanning).
- Vehicle route optimization and multi-stop logistics tracking.
- Partial split shipments across multiple independent warehouses (each order is fulfilled from its primary designated warehouse).
- Manufacturing bill-of-materials (BOM) recalculations (handled in future Production context).

## Further Notes

- The database already uses UUID primary keys (`String @id @default(uuid())`) and already maintains `sales_invoices.sales_order_id`. No breaking schema alteration to `BIGINT` is needed.
- Existing orders in legacy statuses (`PENDING_APPROVAL`, `APPROVED`, `READY_TO_SHIP`) will seamlessly map to the operational workflow.
