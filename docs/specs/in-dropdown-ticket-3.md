# Ticket 3: Purchases UI: In-Dropdown Creation & In-Row Auto-Fill Integration

## Parent

Part of #25

## What to build

Integrate in-dropdown creation across `PurchaseDocumentForm.tsx`:
1. Supplier Select -> opens `CreateCounterpartyDrawer` with auto-select on save.
2. Warehouse Select -> opens `CreateWarehouseDrawer` with auto-select on save.
3. In-table Product Select -> opens `CreateProductDrawer` with pre-filled search term and auto-populates that specific row's product, cost price, and unit of measure upon save.

## Acceptance criteria

- [ ] In `PurchaseDocumentForm.tsx`, Supplier Select provides `+ Yangi yetkazib beruvchi` action bar.
- [ ] Warehouse Select provides `+ Yangi ombor` action bar.
- [ ] Line item Product Selects provide `+ Yangi tovar` action bar and passes active row search query.
- [ ] Creating a product auto-fills the targeted item row's `productId`, `unitPrice`, `unitOfMeasure`, and triggers subtotal recalculations.
- [ ] Creating a supplier or warehouse auto-updates dropdown value and displays supplier debt badge accordingly.

## Blocked by

- #26 (Select UI: Universal Pinned Action Bar Enhancement)
- #27 (Warehouses UI: CreateWarehouseDrawer Component & API Integration)
