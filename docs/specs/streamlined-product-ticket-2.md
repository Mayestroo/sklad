# Ticket 2: Purchases UI: In-Row Product Quantity, Price & Unit Auto-Fill Integration

## Parent

Part of #29

## What to build

Update `PurchaseDocumentForm.tsx` to handle the `quantity` returned from `CreateProductDrawer.onSuccess(createdProduct, quantity)`:
- When a product is created from inside an item row's dropdown, auto-fill that specific row with:
  - `productId = createdProduct.id`
  - `quantity = Number(quantity) || 1`
  - `unitPrice = Number(createdProduct.costPrice) || 0`
  - `unitOfMeasure = createdProduct.unitOfMeasure`
- Recalculate line totals and document subtotal, discount, VAT, and grand total.

## Acceptance criteria

- [ ] Creating a product from an item row dropdown immediately populates that row with the entered `quantity` and `unitPrice`.
- [ ] Line totals, VAT, and document totals are recalculated in real time.
- [ ] Works seamlessly for both fractional (`kg`/`litr`) and integer (`dona`) units.
- [ ] Clears the active row index tracking state cleanly after populating.

## Blocked by

- #30 (Products UI: Streamline CreateProductDrawer to 5 Essential Fields & Dynamic Quantity Input)
