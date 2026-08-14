## Parent

Part of #12

## What to build

Managers and executives can view a complete 360-degree Supplier Profile and procurement analytics dashboard. The view aggregates total purchasing volume, total paid amounts, current accounts payable debt, purchase receipt history, payment transactions, and returns. Includes advanced multi-criteria filtering across the main purchases ledger and enforces granular RBAC permissions.

## Acceptance criteria

- [ ] Supplier 360° profile view aggregates key procurement metrics: Total Purchases Amount, Total Paid Amount, Net Debt Balance, and Active Contracts.
- [ ] Supplier profile includes tabbed audit lists for Purchase Receipts, Financial Payments, Purchase Returns, and Contracts with direct links to documents.
- [ ] Main purchases list supports comprehensive filtering: by date range, supplier, warehouse, currency, document status (`DRAFT`, `POSTED`, `CANCELLED`), payment status (`UNPAID`, `PARTIALLY_PAID`, `PAID`), and return status.
- [ ] Granular RBAC permissions enforced across all endpoints and UI actions (`purchases.view`, `purchases.create`, `purchases.post`, `purchases.unpost`, `purchases.expenses`, `purchases.returns`).
- [ ] Automated integration tests verify analytical calculations, multi-filter query accuracy, and RBAC authorization guardrails.

## Blocked by

- #16 (Purchases: Financial Payment Linking & Multi-Currency Settlements)
- #17 (Purchases: Purchase Returns & Inventory/Debt Reversals)
