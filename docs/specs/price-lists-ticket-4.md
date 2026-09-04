## Parent
Part of #83

## What to build
Integrate multi-tier pricing directly into product management (`CreateProductDrawer`).
- When Multi-tier pricing is enabled, render input rows for all active Price Lists under the "Narxlar" section in `CreateProductDrawer`.
- Submitting the form persists base selling price (`salePrice`) and all entered tier prices atomically in `product_prices`.
- Editing an existing product pre-populates existing tier prices.

## Acceptance criteria
- [ ] `CreateProductDrawer` loads active price lists and renders tier price inputs when feature is enabled
- [ ] Product creation and updates atomically persist `ProductPrice` rows
- [ ] Unset tier prices remain clean without creating empty or zeroed records unless explicitly typed

## Blocked by
- #85
