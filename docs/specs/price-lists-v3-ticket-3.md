## Parent
#120

## What to build
Implement the end-to-end Auto-Pricing engine for Sales Orders and Invoices, including fallback hierarchy, real-time multi-currency exchange rate conversion, and seller manual override controls:
- Selecting a customer in `SalesOrderForm` / `SalesInvoiceForm` auto-populates the order's `priceListId` from the customer's profile and recalculates line unit prices.
- Adding product items resolves unit prices from the active price list via `resolveProductPrice`. If the product is unpriced in that list, safely fall back to `Product.salePrice` with 0% discount.
- If the price list currency differs from document currency (e.g. USD price list on UZS order), dynamically convert unit prices using document `exchangeRate`.
- Changing the price list dropdown on the order header recalculates all product lines with the new price list.
- Lock unit price field (`readOnly`) for users without `sales:override_price` or when `allowSellerPriceOverride` is false. If overridden below landed cost, trigger Below-Cost Guardrail warning.

## Acceptance criteria
- [ ] Selecting a customer in `SalesOrderForm` / `SalesInvoiceForm` auto-populates `priceListId` and updates line item unit prices.
- [ ] Unlisted items in a price list safely fall back to catalog base price with 0% discount without error.
- [ ] Foreign currency price lists (e.g. USD) dynamically convert into order currency (e.g. UZS) using `order.exchangeRate`.
- [ ] Changing order header price list dropdown updates all existing row prices.
- [ ] Unit price field is read-only unless seller override permission is granted, and respects Below-Cost Guardrail.
- [ ] All unit and regression tests in `sales-invoices.service.spec.ts` pass cleanly.

## Blocked by
- #121 (T1: Sales Settings Toggle, Sidebar Navigation & Customer Price List Assignment)
