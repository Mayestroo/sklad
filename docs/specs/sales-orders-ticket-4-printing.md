# T4 — Warehouse Operational Printing: Pick List & Delivery Note

**Parent:** #73
**GitHub Issue:** #77
**Status:** ready-for-agent
**Blocked by:** #75, #76

## What to build
Standardized A4 print templates and modals accessible directly from the Sales Orders list and order detail view:
1. Pick List (Yig'uv varaqasi) for `PROCESSING` orders: items, SKU, barcode, unit of measure, quantity to pick (no commercial prices).
2. Delivery Note (Yuk xati / Nakladnaya) for `SHIPPED` orders: order and linked invoice number, customer and seller details, itemized quantities and prices, total sum, VAT, signature blocks for dispatcher and recipient.

## Acceptance criteria
- [ ] 'Chop etish: Yig\'uv varaqasi' button/action available in table and order details.
- [ ] Pick list displays item, SKU/barcode, unit, qty, checkboxes; hides commercial prices.
- [ ] 'Chop etish: Yuk xati' button/action available for `SHIPPED` orders.
- [ ] Delivery note displays full commercial details, invoice number, totals, and signature blocks.
- [ ] Clean browser-native `window.print()` CSS styles formatted for standard A4 paper.
