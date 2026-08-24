# Ticket: Sales Orders (Zakazlar) Module — MVP

## Problem Statement

Sales teams currently have no way to record a customer commitment before goods are produced and dispatched. When a client orders 500 units of a product that must be manufactured, the seller must either (a) create a Sales Invoice immediately — which incorrectly deducts inventory and creates AR before anything is ready — or (b) track the order offline in spreadsheets and re-enter everything into the system at dispatch time. This means the business has no real-time visibility into what is in production, what payment has been collected, or when goods will be ready to ship.

## Solution

Introduce a **Sales Order** (Zakaz) entity with a 13-state lifecycle that bridges the gap between a customer's commitment and a posted Sales Invoice. A Sales Order coordinates four departments — Sales, Production, Finance, and Warehouse — around a single document. Inventory does not move and AR is not created until the warehouse dispatches the goods; at that moment the system automatically creates and posts a Sales Invoice. All parties work from the same Sales Order: sellers create it, production marks output ready, finance records payments, and warehouse ships when payment conditions are met.

## User Stories

### Seller (Sotuvchi)

1. As a seller, I want to create a Sales Order with a customer, product lines, quantities, and a unit price per line, so that I can record a customer commitment without touching inventory.
2. As a seller, I want the order number to be assigned automatically (format `Z-XXXXXX`, same sequence style as Sales Invoices), so that I never need to manage numbering manually.
3. As a seller, I want to choose a payment condition (`PREPAID_100`, `PARTIAL`, or `CREDIT`) at order creation time, so that the dispatch gate enforces the correct payment rule automatically.
4. As a seller, I want to set a `requiredPaymentPercent` when choosing `PARTIAL` payment condition, so that the system knows what minimum percentage of the total must be collected before dispatch is allowed.
5. As a seller, I want to set a required delivery date (kerakli sana) on the order, so that the business can track deadline risk.
6. As a seller, I want to add a free-text delivery address and a comment on the order, so that logistics details are captured in one place.
7. As a seller, I want to select a responsible seller (mas'ul sotuvchi) on each order, so that orders are attributed and filterable by owner.
8. As a seller, I want to submit the order for approval, transitioning it from `NEW` to `PENDING_APPROVAL`, so that management is notified that a commitment needs sign-off.
9. As a seller, I want to cancel an order that is in `NEW` or `PENDING_APPROVAL` status, so that I can correct mistakes before approval.
10. As a seller, I want to see the full order card showing: order details, line items, production status, payment status, counterparty debt, and status history — so that I have a complete picture without switching between modules.

### Manager / Administrator (Rahbar)

11. As a manager, I want to approve a `PENDING_APPROVAL` order (transition to `APPROVED`), so that only vetted commitments proceed to production and dispatch.
12. As a manager, I want to send an `APPROVED` order to production (transition to `SENT_TO_PRODUCTION`), so that the production team receives their task.
13. As a manager, I want to force-cancel any order including those in `IN_PRODUCTION`, so that the business has an escape hatch for exceptional situations.
14. As a manager, I want the system to automatically cancel the linked Production Order stubs when I force-cancel an in-production Sales Order, so that the production team is not left working on a dead commitment.
15. As a manager, I want to confirm final delivery (`SHIPPED` → `COMPLETED`), so that the order is closed and counted in completed-order reports.
16. As a manager, I want to see a dashboard panel with counts of orders in each key status (New, In Production, Ready, Awaiting Payment, Ready to Ship, Completed), so that I can monitor the pipeline at a glance.

### Production Worker (Ishlab chiqaruvchi)

17. As a production worker, I want to see incoming production tasks (Production Order stubs) generated from Sales Orders, so that I know what to manufacture without being given a separate document.
18. As a production worker, I want to mark a Production Order stub as `IN_PROGRESS` (transition Sales Order to `IN_PRODUCTION`), so that management can see work has started.
19. As a production worker, I want to enter a `readyQty` value on a Production Order stub (partial or full), so that the system updates the Sales Order line's `readyQty` and transitions status automatically.
20. As a production worker, I want the Sales Order to automatically transition to `PARTIALLY_READY` when I record partial output, so that the seller can see progress in real time.
21. As a production worker, I want the Sales Order to automatically transition to `READY` when all line items reach `readyQty = quantity`, so that the next step (payment check) is triggered without manual intervention.

### Finance Officer (Moliya bo'limi)

22. As a finance officer, I want to record a payment against a Sales Order (before dispatch) linked by `orderId`, so that advance and partial payments are tracked in the same `Payment` table as post-dispatch payments.
23. As a finance officer, I want the Sales Order's `paidAmount` to update automatically whenever a payment is recorded or reversed, so that I always see the current collected total.
24. As a finance officer, I want to see a clear breakdown on the order card: total amount, paid amount, remaining amount, and payment percentage, so that I can confirm the dispatch gate status at a glance.
25. As a finance officer, I want the Sales Order to automatically transition to `PAYMENT_CONFIRMED` then `READY_TO_SHIP` when payment conditions are met after the order reaches `READY` status, so that the warehouse is unblocked without a manual step.
26. As a finance officer, I want orders with `CREDIT` payment condition to proceed to `READY_TO_SHIP` automatically once goods are ready, without any payment check, so that credit customers are not blocked at the gate.

### Warehouse Worker (Ombor xodimi)

27. As a warehouse worker, I want to see all Sales Orders in `READY_TO_SHIP` status, so that I know which dispatches are authorized.
28. As a warehouse worker, I want the system to block me from dispatching an order that is not yet `READY_TO_SHIP`, so that I cannot accidentally ship before payment conditions are met.
29. As a warehouse worker, I want to create an outbound dispatch against a `READY_TO_SHIP` Sales Order that atomically: (a) deducts stock from the warehouse, (b) creates and posts a Sales Invoice, and (c) transitions the Sales Order to `SHIPPED` — so that inventory, AR, and order status are all updated in one operation.

### Any Role (Read / Audit)

30. As any user, I want to filter the Sales Orders list by: order number, counterparty, date range, status, assigned seller, product, payment status, and delivery date — so that I can find relevant orders quickly.
31. As any user, I want to see the full status history of a Sales Order (old status, new status, timestamp, user, optional comment), so that I have a complete audit trail.
32. As any user, I want to see a counterparty's Sales Order history (all orders, totals, paid amounts, outstanding balances) on the counterparty profile page, so that I can assess their relationship with the business.

## Implementation Decisions

### New `SalesOrderStatus` enum

Replace the skeleton `SalesOrder.status: InvoiceStatus` with a new dedicated enum:

```
NEW → PENDING_APPROVAL → APPROVED → SENT_TO_PRODUCTION → IN_PRODUCTION
  → PARTIALLY_READY → READY → AWAITING_PAYMENT → PAYMENT_CONFIRMED
  → READY_TO_SHIP → SHIPPED → COMPLETED
                                  ↑
                             CANCELLED (from any pre-SHIPPED state, role-gated)
```

Manual transitions (role-gated): `NEW→PENDING_APPROVAL`, `PENDING_APPROVAL→APPROVED`, `APPROVED→SENT_TO_PRODUCTION`, `SHIPPED→COMPLETED`.  
Cancellation: Seller can cancel `NEW`/`PENDING_APPROVAL`; Manager/Admin can cancel up to `SENT_TO_PRODUCTION`; Admin only can force-cancel `IN_PRODUCTION` or later (pre-SHIPPED).  
Automatic transitions (triggered by system events): production output updates (`→PARTIALLY_READY`, `→READY`), payment recording (`→AWAITING_PAYMENT` when not yet met, `→PAYMENT_CONFIRMED`→`READY_TO_SHIP` when met), warehouse dispatch (`→SHIPPED`).

### `SalesOrder` schema additions

The existing `SalesOrder` model (currently a skeleton) must gain:

- `currency String @default("UZS")`
- `exchangeRate Decimal @default(1)`
- `status SalesOrderStatus @default(NEW)` — replaces `InvoiceStatus`
- `paymentCondition PaymentCondition` — new enum: `PREPAID_100 | PARTIAL | CREDIT`
- `requiredPaymentPercent Decimal?` — only set when `paymentCondition = PARTIAL`
- `paidAmount Decimal @default(0)` — updated by Finance payment events
- `subtotalAmount Decimal @default(0)`, `discountAmount Decimal @default(0)`, `totalAmount Decimal @default(0)` — replaces single `totalAmount`
- `assignedSellerId String?` → `User`
- `deliveryDate DateTime?`
- `deliveryAddress String?`
- `comment String?`
- `warehouseId String?` → `Warehouse` — optional at creation, set at dispatch time
- `createdById String?` → `User`
- `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`

### `SalesOrderItem` schema additions

- `discount Decimal @default(0)` — per-line discount percentage
- `readyQty Decimal @default(0)` — maintained exclusively by `ProductionOrdersService`; `remainingQty = quantity - readyQty` is computed at the application layer, never stored

### New `ProductionOrder` stub model

A `ProductionOrder` row is created for each `SalesOrderItem` automatically when the Sales Order transitions to `SENT_TO_PRODUCTION`:

- `id`, `tenantId`
- `salesOrderId` → `SalesOrder`
- `productId` → `Product`
- `requiredQty Decimal`
- `readyQty Decimal @default(0)`
- `status ProductionOrderStatus @default(PENDING)` — enum: `PENDING | IN_PROGRESS | DONE | CANCELLED`
- `dueDate DateTime?`
- `assignedToId String?` → `User`
- `createdAt`, `updatedAt`

Only `ProductionOrdersService` may write `SalesOrderItem.readyQty`. If a `ProductionOrder` is cancelled or output is rolled back, the corresponding `readyQty` decrement must occur in the same transaction.

### Payment linkage (`Payment` model extension)

Add `orderId String? @map("order_id")` and the `salesOrder SalesOrder?` relation to the existing `Payment` model. A check constraint enforces exactly one of `invoiceId` or `orderId` is non-null. The existing Finance service payment creation flows must accept `orderId` as an alternative to `invoiceId`.

When a payment is posted against a Sales Order: (1) increment `SalesOrder.paidAmount`; (2) re-evaluate the dispatch gate; (3) if gate is now satisfied and the order is `READY` or `AWAITING_PAYMENT`, auto-transition to `PAYMENT_CONFIRMED` → `READY_TO_SHIP`. Payments are never re-linked to the `SalesInvoice` created at dispatch — the invoice's `paidAmount` is computed by summing `Payment` rows referencing the originating `orderId`.

### Dispatch gate logic

At dispatch time (warehouse posts OUTBOUND):

| `paymentCondition` | Gate passes when |
|---|---|
| `PREPAID_100` | `paidAmount >= totalAmount` |
| `PARTIAL` | `paidAmount >= totalAmount × requiredPaymentPercent / 100` |
| `CREDIT` | Always — no check |

### Auto-SalesInvoice creation on dispatch (ADR-0014)

Within a single database transaction, the dispatch event must:
1. Re-validate the dispatch gate (safety net).
2. Create and post a `SalesInvoice` copying counterparty, currency, exchange rate, and all line items from the Sales Order. Set `salesInvoice.salesOrderId`.
3. Run FIFO batch consumption and stock deduction (reuse existing `SalesInvoicesService` posting logic).
4. Set `SalesOrder.warehouseId` from the dispatch document.
5. Transition `SalesOrder.status` to `SHIPPED`.

The `SalesInvoice` model gains `salesOrderId String? @map("sales_order_id")` FK.

### Cancellation side effects

When an Admin force-cancels an order in `IN_PRODUCTION` or later (pre-SHIPPED): all linked `ProductionOrder` stubs with status `PENDING` or `IN_PROGRESS` are transitioned to `CANCELLED` in the same transaction. No inventory effects (no inventory has moved at this point).

### Audit

All status transitions are written to the existing generic `AuditLog` model (`entityType = "SalesOrder"`, `action = UPDATE`, `oldValue / newValue` containing the old and new status JSON). The status history panel on the order card queries `AuditLog` filtered by `entityId`. No new audit table is needed.

### New backend module: `SalesOrdersModule`

Lives at `backend/src/modules/sales/orders/` alongside the existing `invoices/` sub-module. Exposes:
- `SalesOrdersService` — full lifecycle: CRUD, status machine, payment gate evaluation, production-stub creation, dispatch trigger, auto-SalesInvoice creation
- `SalesOrdersController` — REST endpoints following the Sales Invoices controller pattern
- `ProductionOrdersService` (stub) — create, update `readyQty`, cancel; calls back to `SalesOrdersService` to propagate status changes

### Frontend

New pages under the Sales > Orders route. List page with all filters (§19 of the TZ). Order card page with all sections (§20): header, line items (with ready/remaining), production panel, payment panel (gate status, history), linked Sales Invoice, status history, responsible users.

## Testing Decisions

Tests live in `sales-orders.service.spec.ts` following the exact pattern of `sales-invoices.service.spec.ts`: Jest unit tests with a fully mocked `PrismaService` (all methods as `jest.fn()`), no database, no HTTP layer. Test observable state transitions and guard rejections only — not internal helper calls.

Good tests to write:

- Creating an order produces `NEW` status with correct `totalAmount` computed from line items.
- Creating an order without a counterparty or without at least one line item throws `BadRequestException`.
- Dispatch gate throws `BadRequestException` when `paidAmount < requiredAmount` for `PREPAID_100` and `PARTIAL` orders.
- Dispatch gate passes for `CREDIT` orders regardless of `paidAmount`.
- Recording a payment that satisfies the gate auto-transitions status through `PAYMENT_CONFIRMED` to `READY_TO_SHIP`.
- A seller cancelling an `IN_PRODUCTION` order throws `ForbiddenException`.
- An admin force-cancelling an `IN_PRODUCTION` order also cancels all linked `ProductionOrder` stubs.
- A production `readyQty` update that fills all lines auto-transitions the order to `READY` (or straight to `READY_TO_SHIP` for `CREDIT` orders).
- Dispatch on a non-`READY_TO_SHIP` order throws `BadRequestException`.
- Dispatch on a `READY_TO_SHIP` order creates a posted `SalesInvoice` with correct line items, links `salesOrderId`, and transitions the order to `SHIPPED`.

Prior art: `sales-invoices.service.spec.ts` for mock setup, guard assertion patterns, and transaction-scope test structure.

## Out of Scope

- **Partial shipment**: deferred. MVP is one dispatch = one Sales Invoice = order complete.
- **Credit limits per counterparty**: `CREDIT` payment condition bypasses the gate entirely for MVP. Credit limits are a future Counterparty module feature.
- **Full Production module**: BOM, production steps, machine scheduling, and raw material consumption are a separate future TZ.
- **Price lists and automatic pricing**: unit prices are entered manually on each line.
- **Multi-warehouse partial dispatch**: one warehouse per order in MVP.
- **Sales Order amendments after approval**: cancel and recreate.

## Further Notes

- The `Z-` prefix + same zero-padded counter as Sales Invoices. Reuse the existing number-generation utility with a different prefix.
- The existing `sales_orders` table is a skeleton with no production data; the migration dropping `InvoiceStatus` in favor of `SalesOrderStatus` is non-destructive.
- `CONTEXT.md` and ADRs 0013–0016 have been updated as part of this design session.
