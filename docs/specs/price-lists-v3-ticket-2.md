## Parent
#120

## What to build
Provide a complete two-way synchronization between the Product Catalog and Price Lists:
- In `ProductsService`, ensure product queries by ID (`findUnique` / `findOne`) include linked `productPrices: { select: { priceListId: true, price: true } }`.
- In `CreateProductDrawer`, when editing an existing product (`productToEdit`), pre-populate `tierPrices` with the product's existing prices for each active price list.
- On drawer form submission (both creation and update), persist the product base `salePrice` and atomically upsert all non-empty tier prices to the respective price lists (`POST /sales/price-lists/:plId/items`).
- In the `/sales/prices` master-detail view, ensure inline price editing updates `ProductPrice` and displays recalculated discount/markup percentages instantly.

## Acceptance criteria
- [ ] `ProductsService.findOne` includes `productPrices` with `priceListId` and `price`.
- [ ] Opening `CreateProductDrawer` with `productToEdit` pre-loads and displays existing tier prices for each active price list under "Narxlar".
- [ ] Submitting `CreateProductDrawer` saves base `salePrice` and upserts tier prices in `ProductPrice`.
- [ ] `/sales/prices` right-panel table supports inline price editing with real-time discount/markup percentage recalculation.

## Blocked by
- #121 (T1: Sales Settings Toggle, Sidebar Navigation & Customer Price List Assignment)
