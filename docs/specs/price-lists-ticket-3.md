## Parent
Part of #83

## What to build
Integrate Price Lists with Counterparties (Customers) and build the Dynamic Auto-Pricing Engine.
- Counterparty creation and edit drawer (`CreateCounterpartyDrawer`) requires `priceListId` for `CUSTOMER` and `BOTH` counterparties when Multi-tier pricing is enabled (suppliers exempt).
- Dynamic price evaluation endpoint `GET /api/v1/sales/products/:productId/price?counterpartyId=...&priceListId=...&currency=...` implements the strict fallback hierarchy:
  1. Customer Tier Price (`ProductPrice`)
  2. Default Company Price List price
  3. Product Base Price (`Product.salePrice`) with 0% discount
- Automatic currency conversion using order exchange rate when price list currency differs from target currency.

## Acceptance criteria
- [ ] `CreateCounterpartyDrawer` validates price list assignment for customers when tiered mode is active
- [ ] `GET /api/v1/sales/products/:id/price` resolves applicable unit price adhering to hierarchy
- [ ] Multi-currency conversion applies correctly when price list currency != requested currency
- [ ] Comprehensive unit tests verify price resolution edge cases

## Blocked by
- #85
