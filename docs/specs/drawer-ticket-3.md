# Ticket 3: Products Catalog Creation Drawer Migration

## Parent

Part of #19

## What to build

Migrate the `+ Yangi tovar` creation flow on `/products` to the new Slide-Over Drawer standard with auto-generated SKUs, category selection, barcodes, unit of measure, and purchase/selling prices.

## Acceptance criteria

- [ ] Replaces modal with `CreateProductDrawer` sliding in from the right.
- [ ] Product details: bilingual name (`uz`/`ru`), category selector, auto-generated SKU button, barcode input, unit of measure, minimum stock threshold, cost price, and selling price.
- [ ] Validates duplicate barcodes/SKUs and presents server errors in drawer alert banner.
- [ ] Auto-refetches product catalog upon save and selects or highlights new product.
- [ ] Supports hotkeys (`Esc` to cancel, `Ctrl+Enter` to save).

## Blocked by

- #20 (Drawer UI: Core Slide-Over Drawer Component & Accessibility Framework)
