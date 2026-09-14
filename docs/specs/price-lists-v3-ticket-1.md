## Parent
#120

## What to build
Allow business owners and administrators to configure Sales Settings under Settings -> Sales Settings (`/settings/sales`).
Add and manage the toggle `enableMultiTierPriceLists` ("Ko'p darajali narxlar va chegirma jadvallaridan foydalanish"):
- When disabled (Simple Mode), the sidebar menu item `/sales/prices` is hidden, and sales documents strictly use `Product.salePrice`.
- When enabled (Tiered Mode), `/sales/prices` appears in the sidebar, and multi-tier pricing is activated across the system.
- Customer creation and editing (`CreateCounterpartyDrawer`) requires selecting an active Price List (`priceListId`) when Multi-tier pricing is enabled, defaulting to the company default price list. Suppliers are exempt.

## Acceptance criteria
- [ ] Settings page `/settings/sales` renders toggle and updates `Company.settings.sales.enableMultiTierPriceLists` with optimistic UI and auth context synchronization.
- [ ] `Sidebar.tsx` hides `/sales/prices` navigation item when setting is false/undefined, and displays it when true.
- [ ] `CreateCounterpartyDrawer.tsx` enforces `priceListId` as mandatory when `enableMultiTierPriceLists` is true and counterparty type is `CUSTOMER` or `BOTH`.
- [ ] Counterparty API validates foreign key reference to `PriceList`.

## Blocked by
- None — can start immediately.
