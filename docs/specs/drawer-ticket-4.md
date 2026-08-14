# Ticket 4: In-Flight Purchase Quick-Add & Expense Allocation Drawer Upgrade

## Parent

Part of #19

## What to build

Upgrade quick supplier add, quick product add, and expense allocation forms inside the Purchases module (`PurchaseDocumentForm`, `/purchases/expenses`) to right-sliding Drawers.

## Acceptance criteria

- [ ] In `PurchaseDocumentForm.tsx`, clicking `+ Yangi` on supplier field opens `QuickAddSupplierDrawer` from the right.
- [ ] In `PurchaseDocumentForm.tsx`, clicking `+ Yangi tovar` or scanning an uncataloged barcode opens `QuickAddProductDrawer` from the right.
- [ ] In `/purchases/expenses`, clicking `+ Yangi Xarajat Taqsimlash` opens `AllocateExpenseDrawer` from the right.
- [ ] Newly added suppliers and products are immediately selected in the active purchase document items table without lost focus.

## Blocked by

- #21 (Drawer UI: Counterparties & Suppliers Creation Drawer Migration)
- #22 (Drawer UI: Products Catalog Creation Drawer Migration)
