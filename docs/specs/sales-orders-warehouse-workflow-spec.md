# Specification: Sotuvlar va Ombor Integratsiyasi — Buyurtmalar, 1-Click Otgruzka va Rollar Ish Zanjiri (Workflow)

## Problem Statement

In high-volume distribution, wholesale, and trade operations, the lack of coordination between sales managers and warehouse personnel creates critical operational bottlenecks:
1. **Double-Selling & Stock Ambiguity**: When a sales manager negotiates with a buyer and creates an order, inventory is not immediately reserved. Other sellers can commit and sell the same products, leading to embarrassing stockouts and broken customer commitments.
2. **Premature Stock Deduction or Inaccurate Accounting**: If sellers attempt to "lock" stock by prematurely creating a posted sales invoice (Realizatsiya), inventory is immediately decremented and customer accounts receivable are booked before the goods have even been packed or left the warehouse. This distorts financial balance sheets, tax reporting, and actual warehouse stock.
3. **Manual Overhead & Disconnected Fulfillments**: Warehouse operators previously had to manually re-enter order items into separate sales invoices upon shipment. There was no direct, single-action workflow to transition orders from acceptance, picking, and packing through to final shipment.
4. **Missing Warehouse Documentation**: Warehouse pickers had no dedicated Pick List (*Yig'uv varaqasi*) showing items, quantities, and storage locations without commercial pricing, while dispatchers lacked an immediate standard Delivery Note (*Yuk xati / Nakladnaya*) upon handing over goods to couriers or drivers.
5. **Credit Risk & Payment Gate Bypass**: Goods could be dispatched on prepaid orders before cashiers confirmed payment receipts, resulting in uncollected debts and lost revenue.

## Solution

A robust, role-separated operational workflow that bridges Sales Orders (*Buyurtmalar*) and Outbound Sales (*Tovar sotish / Realizatsiya*):
1. **Clear Role Separation**:
   - **Sales Manager (*Sotuvchi*)**: Creates and edits customer commitments in `SalesOrder` (`NEW`). Requested goods are automatically placed into `StockReservation` (*bron*), preserving physical warehouse stock while decrementing free stock.
   - **Warehouse Manager (*Ombor mudiri / Omborchi*)**: Receives, acknowledges (`ACCEPTED`), picks/packs (`PROCESSING`), stages (`READY_FOR_SHIPMENT`), and fulfills orders (`SHIPPED`).
   - **Finance / Cashier**: Registers payments against orders to satisfy the Dispatch Gate.
2. **6-Stage Core Operational State Machine**:
   ```
   NEW ──► ACCEPTED ──► PROCESSING ──► READY_FOR_SHIPMENT ──► SHIPPED
    │          │            │                  │
    └──────────┴────────────┴──────────────────┴─────────────► CANCELLED
   ```
3. **1-Click Otgruzka (Automatic Sales Invoice Generation)**:
   Advancing status to `SHIPPED` (or clicking "Otgruzka qilish" in order details) atomically creates and posts a sequential `SalesInvoice` (`INV-YYYY-XXXX`) linked to the order, consumes FIFO product batches, releases reservations, decrements warehouse stock, and accrues customer debt within an ACID database transaction.
4. **Dispatch Gate Enforcement**:
   Orders configured with `PREPAID_100` or `PARTIAL` payment conditions require confirmed payments before the warehouse can execute shipment, eliminating unauthorized credit releases.
5. **Interactive In-Table Status Switcher & Printing**:
   Warehouse operators can advance order states directly from the orders table dropdown without opening the full document editor, and can generate both non-commercial Pick Lists (*Yig'uv varaqasi*) and formal commercial Delivery Notes (*Yuk xati / Nakladnaya*).

## User Stories

1. As a sales manager, I want to create a new Sales Order with customer details, currency, warehouse, and line items, so that commercial customer commitments are formally documented.
2. As a sales manager, I want the system to automatically reserve stock (`StockReservation`) when an order is created in `NEW` status, so that other sellers cannot sell the reserved items.
3. As a sales manager, I want to see real-time stock availability and warnings if requested quantities exceed free stock, so that I do not promise unavailable goods to customers.
4. As a sales manager, I want to cancel an unfulfilled order in `NEW` status, so that all reserved stock is immediately released back to available free inventory.
5. As a sales manager, I want to monitor the live operational status of my orders (`ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`, `SHIPPED`), so that I can provide prompt delivery updates to clients.
6. As a warehouse manager, I want to view an active queue of incoming Sales Orders filtered by status and warehouse, so that daily picking schedules can be prioritized.
7. As a warehouse manager, I want to transition an order from `NEW` to `ACCEPTED` directly from the orders table dropdown, so that the sales team knows the warehouse has verified stock and accepted the order.
8. As a warehouse operator, I want to move an accepted order to `PROCESSING` status, so that colleagues know the order is currently being picked and packed on the warehouse floor.
9. As a warehouse picker, I want to print a Pick List (*Yig'uv varaqasi*) for a `PROCESSING` order, so that I have an itemized physical checklist of items, SKUs, barcodes, and quantities without commercial prices.
10. As a warehouse operator, I want to advance an order to `READY_FOR_SHIPMENT` when packing is finished, so that logistics dispatchers and drivers know packages are staged at the loading bay.
11. As a warehouse manager, I want to execute 1-Click Otgruzka by advancing status to `SHIPPED`, so that goods are formally dispatched without manual sales invoice creation.
12. As a warehouse manager, I want the system to automatically create and post a sequential `SalesInvoice` linked by `salesOrderId` upon shipment, so that accounting ledgers and customer receivables are updated atomically.
13. As a warehouse manager, I want the shipment transaction to deduct warehouse inventory using FIFO batches, calculate accurate unit COGS, and consume the linked stock reservations.
14. As a warehouse dispatcher, I want to print a formal Delivery Note (*Yuk xati / Nakladnaya*) immediately upon shipment, so that the delivery driver carries signed documentation with item prices, total sums, VAT, and official signature blocks.
15. As a cashier/finance officer, I want to register advance payments against a Sales Order, so that prepaid dispatch gates are satisfied and payments automatically reflect on the resulting sales invoice.
16. As a business owner, I want the system to block warehouse dispatch if an order's Payment Condition (`PREPAID_100` or `PARTIAL`) is not satisfied, so that goods are never dispatched without requisite payment.
17. As an administrator, I want role permissions enforced so that sales staff cannot bypass warehouse stages or ship orders without warehouse or administrative authority.
18. As an auditor, I want immutable audit logs generated whenever order statuses change or automated invoices are created, so that full accountability is maintained between Sales and Warehouse teams.

## Implementation Decisions

### 1. State Machine & Lifecycle Alignment
The Sales Order lifecycle standardizes on the 6-stage operational pipeline:
```
NEW ──► ACCEPTED ──► PROCESSING ──► READY_FOR_SHIPMENT ──► SHIPPED
 │          │            │                  │
 └──────────┴────────────┴──────────────────┴─────────────► CANCELLED
```
- Existing database relations (`SalesOrder`, `SalesOrderItem`, `SalesInvoice`, `StockReservation`, `Payment`) are maintained.
- `SalesOrderStatus` enum includes: `NEW`, `ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`, `SHIPPED`, `CANCELLED` (with backward compatibility for existing enterprise production statuses).

### 2. Automatic Stock Reservation on Order Creation
- When an order is created in `NEW` status, `StockReservationService.reserveStockForOrder()` is invoked within the database transaction.
- Available free stock is locked against the order and warehouse (`StockLevel.reservedQuantity` incremented, `StockReservation` row created).
- If free stock is less than requested quantity, available stock is reserved and remaining unreserved quantities are clearly flagged in the UI.
- When an order transitions to `CANCELLED`, `StockReservationService.releaseOrderReservations()` atomically restores all reserved units to free stock.

### 3. One-Click Otgruzka & Atomic Posting Transaction
- Advancing an order to `SHIPPED` via `PATCH /api/v1/sales-orders/:id/status` or clicking dispatch triggers `SalesOrdersService.dispatch()`.
- The following actions execute within a single ACID database transaction:
  1. Validates the Dispatch Gate (`computeGateStatus(order)`).
  2. Generates sequential invoice number (`INV-YYYY-XXXX`).
  3. Creates `SalesInvoice` with `salesOrderId` referencing the order, copying line items, agreed prices, discounts, and currency.
  4. Consumes FIFO `ProductBatch` records, writes `BatchConsumption` rows, and calculates line/total COGS and gross profit.
  5. Deducts physical quantities from `StockLevel`.
  6. Consumes linked `StockReservation` records.
  7. Updates `SalesOrderItem.shippedQty` and marks `SalesOrder.status = SHIPPED`.
  8. Increments `Counterparty.debtBalance` by the invoice total.
  9. Posts the `SalesInvoice` (`SalesDocStatus.POSTED`).

### 4. Dispatch Gate & Payment Condition
- Each order defines a `PaymentCondition`:
  - `PREPAID_100`: Dispatch blocked until `paidAmount >= totalAmount`.
  - `PARTIAL`: Dispatch blocked until `paidAmount >= totalAmount * (requiredPaymentPercent / 100)`.
  - `CREDIT`: Dispatch gate bypassed; warehouse may ship immediately regardless of payment.
- If gate is open (`OPEN`), dispatch throws a `BadRequestException` ("To'lov sharti bajarilmagan. Jo'natishga ruxsat yo'q").

### 5. Role Permissions
- `SELLER`: Can create orders (`NEW`), edit drafts, and cancel unaccepted orders. Forbidden from transitioning to `ACCEPTED`, `PROCESSING`, `READY_FOR_SHIPMENT`, or `SHIPPED`.
- `WAREHOUSE` / `WAREHOUSE_MANAGER` / `OMBORCHI`: Can advance warehouse statuses (`ACCEPTED` $\to$ `PROCESSING` $\to$ `READY_FOR_SHIPMENT` $\to$ `SHIPPED`) and print operational documents.
- `ADMIN` / `MANAGER`: Full oversight across all transitions, cancellations, and gate overrides.

### 6. Frontend Quick Status Switcher & Printing Modals
- **In-Table Status Dropdown**: Sales Orders table features an interactive status dropdown allowing warehouse managers to transition orders in 1 click.
- **Pick List Modal (*OrderPickListModal*)**:
  - Displays Order #, Date, Warehouse, Customer, Line Items, SKUs, Units, Quantities, and Checkboxes.
  - Excludes commercial selling prices, discounts, and financial totals.
- **Delivery Note Modal (*Yuk xati / Nakladnaya*)**:
  - Displays Header (Order #, Linked Invoice #, Date, Seller & Buyer details).
  - Itemized table with quantities, prices, discounts, VAT, and totals.
  - Official handover and acceptance signature blocks for warehouse dispatcher and recipient driver.

## Testing Decisions

### Test Seam: Service & API Integration Layer
The primary testing seam is the backend Service Integration layer (`SalesOrdersService`, `StockReservationService`, Prisma transaction client):
- **Why this seam?** It verifies full transactional atomicity: FIFO stock deduction, reservation consumption, customer debt updates, and state machine validation without UI flakiness.

### Good Test Criteria:
1. **Reservation on Creation**: Creating a `SalesOrder` in `NEW` status increments `StockLevel.reservedQuantity` and creates `StockReservation` rows without altering `physicalStock`.
2. **Release on Cancellation**: Cancelling a `NEW`, `ACCEPTED`, or `PROCESSING` order releases 100% of reserved stock back to `freeStock`.
3. **Dispatch & Invoice Atomicity**: Advancing to `SHIPPED` creates a `POSTED` `SalesInvoice`, consumes reservations, deducts FIFO batches, updates customer debt, and marks the order `SHIPPED`.
4. **Dispatch Gate Safety**: Attempting to ship a `PREPAID_100` order without confirmed payment throws `BadRequestException`.
5. **Role Gating**: A user with only `SELLER` role attempting to trigger `ACCEPTED` or `SHIPPED` receives a `ForbiddenException`.
6. **Insufficient Stock Guard**: Attempting to ship an order when warehouse physical stock has been depleted aborts the transaction cleanly without leaving orphan invoices.

### Prior Art
- `backend/src/modules/sales/orders/sales-orders.service.spec.ts` (17 passing integration tests).
- `backend/src/modules/purchases/purchase-returns.spec.ts` (38 passing invariant and rollback tests).

## Out of Scope

- Mobile WMS barcode hardware scanner Bluetooth integration (future warehouse app iteration).
- GPS courier route optimization and fleet dispatching.
- Split multi-warehouse fulfillment for a single line item (order lines are fulfilled from designated warehouse).
- Manufacturing BOM recalculation (handled under separate Production module).

## Further Notes

- Primary keys use UUIDs (`String @id @default(uuid())`) and `sales_invoices.sales_order_id` is already indexed.
- Seamless compatibility with existing frontend Next.js 16 components and unified confirmation modals.
