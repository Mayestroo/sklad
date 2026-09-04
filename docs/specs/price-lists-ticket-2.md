## Parent
Part of #83

## What to build
Provide a complete master-detail Price Lists view at `/sales/prices`.
- Left sidebar lists created price lists with active/default indicators and a drawer to create new price lists with bilingual names (`uz`/`ru`), currency (`UZS`, `USD`), and default flag.
- Right panel renders a product grid with SKU, Product Name, Category, Base Price (`Product.salePrice`), Tier Price (`ProductPrice.price`), and auto-calculated Discount/Markup percentage badge.
- Inline editing allows fast price updates directly in the grid rows, persisting via bulk upsert API `POST /api/v1/sales/price-lists/:id/items`.

## Acceptance criteria
- [ ] Left sidebar lists price lists with status badges and "+ Yangi narx jadvali" drawer
- [ ] Right grid displays all products with base price, tier price, and discount/markup badges
- [ ] Inline editing with keyboard shortcuts / check button saves prices instantly
- [ ] Bulk upsert API endpoint handles updates atomically with audit logging

## Blocked by
- #84
