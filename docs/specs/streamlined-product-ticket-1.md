# Ticket 1: Products UI: Streamline CreateProductDrawer to 5 Essential Fields & Dynamic Quantity Input

## Parent

Part of #29

## What to build

Refactor `frontend/src/components/products/CreateProductDrawer.tsx` to display only 5 clean fields:
1. Product Name (single unified field, saved to both `uz` and `ru`).
2. Unit of Measure (`dona`, `kg`, `litr`, `metr`, `quti`, `pachka`).
3. Quantity (dynamic label `Soni (kg)` / `Soni (dona)`, allows decimal input for `kg`/`litr`/`metr`).
4. Cost Price (purchase price per unit).
5. Selling Price (optional expected sale price).

Automatically generate `sku` in the background and supply standard defaults for omitted technical fields (`weight: 1`, `minStock: 0`, `type: GOODS`). Pass `(createdProduct, quantity)` to `onSuccess`.

## Acceptance criteria

- [ ] `CreateProductDrawer` displays exactly the 5 specified fields.
- [ ] Changing `unitOfMeasure` dynamically updates the Quantity label (e.g. `Soni (kg)`) and input step (`step="any"` for fractional units).
- [ ] Product creation succeeds via `POST /inventory/products` with auto-generated SKU (`PRD-XXXX`).
- [ ] Invokes `onSuccess(createdProduct, quantity)` callback upon save.
- [ ] Preserves `Esc` and `Ctrl+Enter` keyboard shortcuts.

## Blocked by

- None — can start immediately.
