# Specification: Price Lists & Tiered Pricing (Narxlar va Chegirmalar) Moduli va Savdo Sozlamalari Integratsiyasi v3.0

## Problem Statement

In wholesale, distribution, retail, and multi-channel trade businesses, companies sell products across diverse customer segments (retail buyers, wholesale/optom distributors, VIP accounts, dealers, and custom negotiated contracts). Without a unified and flexible pricing engine:
1. **Single-Price Rigidity (Yagona narx cheklovi)**: Products had only one standard base selling price (`salePrice`). Selling to wholesale or VIP clients at discounted rates forced sales managers to manually calculate and type unit prices line-by-line during order entry, causing operational delays and frequent calculation mistakes.
2. **Margin Vulnerability & Unauthorized Discounts (Nazoratsiz narx tushirish)**: Without centralized price tiers, sales reps could enter arbitrary discounts below company profitability thresholds without managerial authorization or below-cost guardrails.
3. **No Support for Dual Business Modes (Oddiy va B2B rejimlari moslashuvchanligi yo'qligi)**: Small retail businesses need a streamlined, clutter-free single-price interface, whereas expanding B2B operations require multi-tier price lists. The system lacked an instant company-level configuration toggle to switch between Simple Mode and Advanced Tiered Pricing.
4. **Disjointed Product Catalog Pricing (Narxlarni boshqarish tarqoqligi)**: Tier prices could not be viewed or edited directly within the product creation/editing drawer (`CreateProductDrawer`), forcing catalog managers to perform double-entry across disparate pages.
5. **Slow Auto-Pricing & Currency Inconsistencies (Avtomatik narxlash va valyuta nomutanosibligi)**: Selecting a customer did not automatically pull negotiated price tiers into order items, and there was no deterministic conversion mechanism when price lists were maintained in foreign currencies (e.g. USD) while orders were billed in local currency (UZS).

## Solution

A production-grade, full-stack **Price Lists & Tiered Pricing (Narxlar va Chegirmalar)** management system featuring an instant Company Settings toggle, automated dynamic pricing hierarchy, centralized multi-tier grid management, and deep two-way integration across Counterparties, Catalog, Sales Orders, and Sales Invoices:

1. **Company Sales Settings Toggle (Dual Mode)**:
   - **Simple Mode (Oddiy rejim)**: When `enableMultiTierPriceLists` is disabled in Settings -> Sales Settings, the sidebar navigation item `/sales/prices` is hidden, customer price-list selection is bypassed, and all sales documents strictly consume the product's base `salePrice`.
   - **Advanced Tiered Pricing (B2B / Optom rejimi)**: When enabled, `/sales/prices` appears in the sidebar, customer cards enforce selecting a designated Price List (`priceListId`), and dynamic tier pricing is applied automatically across orders and invoices.
2. **Centralized Price List Master & Matrix View (`/sales/prices`)**:
   - **Left Sidebar**: List of created price lists (e.g. "Asosiy", "Ulgurji / Optom", "VIP", "LED", "Elmurod (Shaxsiy)") with active badges, currency indicators (UZS, USD), and default flags, plus a drawer to create/edit price lists.
   - **Right Data Grid**: Displays all catalog products under the selected price list with Base Price (`salePrice`), Jadval Narxi (Tier Price), auto-calculated Chegirma / Ustama foizi (`% Discount / Markup`), and instant inline price editing.
3. **Product Catalog Card Integration (2-Way Sync)**:
   - When creating or editing a product (`CreateProductDrawer`), the "Narxlar" section dynamically renders input fields for all active Price Lists alongside the Base Price, pre-loading existing tier prices during edit mode and saving them atomically.
4. **Dynamic Auto-Pricing Engine in Sales Orders & Invoices**:
   - Selecting a customer automatically populates the customer's assigned `priceListId`.
   - Adding products automatically resolves the applicable unit price following a strict hierarchy:
     1. Customer Tier Price (`ProductPrice` for customer's `priceListId`)
     2. If not specified, Default Company Price List price
     3. If still not specified, Product Base Selling Price (`Product.salePrice`) with 0% discount (Safe Fallback)
   - Real-time Multi-Currency Conversion: If the price list currency differs from the order currency, the engine dynamically converts the unit price using the document's `exchangeRate`.
   - Order-Level Override: Authorized managers can manually change the price list on the order header, triggering instant recalculation of all order lines.
5. **Role-Gated Manual Price Override with Below-Cost Guardrail**:
   - Sales reps without `sales:override_price` permission have read-only unit price fields locked to the resolved tier price. Authorized sellers can override prices, subject to company settings (`allowSellerPriceOverride`) and below-cost warning guardrails.
6. **Referential Integrity & Soft-Deactivation**:
   - Price lists referenced in historical sales orders, invoices, or customer profiles cannot be hard-deleted; attempting to delete them safely marks them as `isActive: false` (archived), preserving historical audit integrity.

## User Stories

1. As a business owner, I want to navigate to Settings -> Sales Settings, so that I can configure my company's sales pricing policies.
2. As a business owner, I want to toggle "Enable Multi-tier Price Lists" on or off, so that my team only sees advanced pricing features when our business model requires it.
3. As an operator in a retail-only business, I want Multi-tier Price Lists to be disabled by default, so that my navigation menu and forms remain clean and simple without unnecessary fields.
4. As a sales administrator in a B2B distribution firm, I want to enable Multi-tier Price Lists, so that I can establish custom price categories for wholesale buyers, distributors, and VIP partners.
5. As a sales manager, I want to see the "Narxlar va chegirmalar" menu under the Sales section in the sidebar when the feature is enabled, so that I can access price list management.
6. As a sales manager, I want the "Narxlar va chegirmalar" menu to be completely hidden from the sidebar when the feature is disabled, so that employees are not confused by unused modules.
7. As a sales manager, I want to open `/sales/prices` and view all configured price lists in the left panel, including their names, currencies, and default status.
8. As a sales manager, I want to click "+ Yangi narx jadvali" to create a new price category with bilingual names (Uzbek/Russian), currency (UZS, USD), and an optional default flag.
9. As a sales manager, I want to designate one price list as default (`isDefault: true`), so that new customers automatically receive standard baseline terms.
10. As a sales manager, I want to select a price list in the left panel and immediately see all catalog products in the right table with SKU, product name, category, and base price.
11. As a sales manager, I want to see the current tier price for each product in the selected price list table, or an indicator that no custom price is set.
12. As a sales manager, I want the system to automatically calculate and display the discount percentage (`((Base - Tier) / Base) * 100%`) when a tier price is lower than the base price.
13. As a sales manager, I want the system to display positive markup percentages (`+X% Ustama`) when a tier price exceeds the base price (e.g. for deferred payment / nasiya price lists).
14. As a sales manager, I want to click inline on a product row in the grid and immediately type a new price, saving it via keyboard enter or checkmark button without full page reloads.
15. As a catalog manager, I want to open the product creation drawer (`CreateProductDrawer`) and see price input fields for all active price lists under the "Narxlar" block.
16. As a catalog manager, I want opening an existing product for editing in `CreateProductDrawer` to pre-load all its current tier prices, so that I can review and modify them in one place.
17. As a catalog manager, I want saving a product in the drawer to persist both the base selling price and all entered tier prices atomically in `ProductPrice`.
18. As a sales representative, I want to create a customer counterparty and select an assigned Price List from a dropdown, so that the customer is permanently mapped to their negotiated price tier.
19. As a sales representative, I want the Price List dropdown on customer creation to be mandatory when Multi-tier pricing is enabled, defaulting to the company's default price list.
20. As a sales representative, I want supplier counterparties (`SUPPLIER`) to be exempt from price list requirements, since price lists only govern customer sales.
21. As a sales representative, I want to create a new Sales Order and pick a customer, so that the system immediately pre-selects the customer's mapped price list on the order header.
22. As a sales representative, I want to add products to the Sales Order and have the system auto-populate line unit prices directly from the customer's price list without manual typing.
23. As a sales representative, I want products without an explicit tier price in that price list to safely fall back to the base `salePrice` without throwing an error or blocking the sale.
24. As a sales representative, I want the system to dynamically convert the tier price into order currency using the order's `exchangeRate` when the price list currency (e.g. USD) differs from the order currency (e.g. UZS).
25. As an authorized sales manager, I want to be able to change the price list on the order header, so that all line item unit prices are instantly recalculated according to the newly selected price list.
26. As a sales manager with `sales:override_price` permission, I want to manually adjust unit prices on order lines when granted special authority for custom negotiations.
27. As a junior seller without `sales:override_price` permission, I want line unit prices to be read-only, preventing unauthorized discounting.
28. As a seller overriding prices, I want the system to validate against the Below-Cost Guardrail, preventing unit prices from dropping below landed cost without administrative authorization.
29. As an operator deleting a price list that is linked to historical orders, invoices, or customers, I want the system to soft-deactivate it (`isActive: false`) rather than hard-delete, preserving accounting and audit integrity.
30. As a business owner, I want disabling Multi-tier Price Lists in settings to preserve all existing `price_lists` and `product_prices` data in the database, so that re-enabling the feature restores previous configurations without data loss.

## Implementation Decisions

### 1. Settings Architecture & Company Schema
- Multi-tier pricing is governed via a centralized JSON settings column on the `Company` model:
  ```prisma
  // model Company in schema.prisma
  settings Json? @default("{}")
  ```
- The typed settings JSON structure:
  ```typescript
  export interface CompanySettings {
    sales?: {
      enableMultiTierPriceLists?: boolean;
      allowSellerPriceOverride?: boolean;
      defaultCurrency?: string;
    };
    inventory?: Record<string, any>;
    accounting?: Record<string, any>;
  }
  ```
- **Default State**: `enableMultiTierPriceLists: false` (Simple Mode).
- **Backend API**:
  - `GET /api/v1/tenants/settings` — Returns tenant company settings.
  - `PATCH /api/v1/tenants/settings` — Updates settings with strict DTO validation (requires `settings:edit` permission).

### 2. Database Models & Relations (Prisma Alignment)
- Sklad ERP uses UUID strings (`String @id @default(uuid())`) and multi-tenant scoping (`tenantId`):
  ```prisma
  model PriceList {
    id             String         @id @default(uuid())
    tenantId       String         @map("tenant_id")
    name           Json           // Bilingual: { uz: string, ru: string }
    currency       String         @default("UZS")
    isDefault      Boolean        @default(false) @map("is_default")
    isActive       Boolean        @default(true) @map("is_active")
    createdAt      DateTime       @default(now()) @map("created_at")
    updatedAt      DateTime       @updatedAt @map("updated_at")

    company        Company        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    prices         ProductPrice[]
    counterparties Counterparty[]
    salesOrders    SalesOrder[]
    salesInvoices  SalesInvoice[]

    @@index([tenantId])
    @@map("price_lists")
  }

  model ProductPrice {
    id          String    @id @default(uuid())
    priceListId String    @map("price_list_id")
    productId   String    @map("product_id")
    price       Decimal   @db.Decimal(15, 2)
    updatedAt   DateTime  @updatedAt @map("updated_at")

    priceList   PriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)
    product     Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

    @@unique([priceListId, productId])
    @@map("product_prices")
  }
  ```
- `Counterparty` model contains `priceListId String? @map("price_list_id")` and `priceList PriceList?`.
- `SalesOrder` and `SalesInvoice` models maintain optional `priceListId` references to capture the active pricing tier at document creation.

### 3. Dynamic Auto-Pricing Hierarchy & Multi-Currency FX Engine
When resolving a product price for a customer and document (`resolveProductPrice`):
1. Check `company.settings?.sales?.enableMultiTierPriceLists`. If false, return product base `salePrice` with 0% discount.
2. Determine target `priceListId`:
   - Priority 1: Document-level `priceListId` (if explicitly chosen on Sales Order / Invoice header).
   - Priority 2: Customer-level `counterparty.priceListId`.
   - Priority 3: Default company price list where `isDefault: true` and `isActive: true`.
3. Lookup `ProductPrice` matching `(targetPriceListId, productId)`.
4. If not found or custom price is zero, execute **Safe Fallback**: return `product.salePrice` with `0%` discount and `isTierPrice: false`.
5. If found, evaluate currency exchange:
   - If `priceList.currency !== document.currency`, convert using document `exchangeRate` (e.g. `USD` tier price `* exchangeRate` for `UZS` document; `UZS` tier price `/ exchangeRate` for `USD` document).
6. Calculate discount and markup percentages relative to catalog `basePrice`:
   - If `tierPrice < basePrice`: `discountPercent = ((basePrice - tierPrice) / basePrice) * 100`.
   - If `tierPrice > basePrice`: `markupPercent = ((tierPrice - basePrice) / basePrice) * 100`.
7. Return payload: `{ resolvedPrice, basePrice, discountPercent, markupPercent, isTierPrice, priceListId, priceListName, currency }`.

### 4. Product Catalog 2-Way Sync (`CreateProductDrawer`)
- `ProductsService.findUnique` and related product retrieval queries must include `productPrices: { select: { priceListId: true, price: true } }`.
- When opening `CreateProductDrawer` in edit mode (`productToEdit`), pre-populate `tierPrices` state with existing values.
- On drawer form submission, persist both the base selling price (`salePrice`) and upsert all non-empty tier prices to `/sales/price-lists/:plId/items` in parallel.

### 5. Seller Price Manual Override & Below-Cost Guardrail
- Controlled via hybrid authorization:
  - Global setting: `company.settings?.sales?.allowSellerPriceOverride`
  - User permission: `sales:override_price`
- If authorized, the unit price input on order lines is editable. If unauthorized, the unit price input is locked (`readOnly`).
- Below-Cost Guardrail: Overriding prices below product unit landed cost triggers a warning modal and requires manager credentials if strict cost protection is enabled.

### 6. Referential Integrity & Soft-Deactivation Policy
- In `SalesInvoicesService.deletePriceList`:
  - If a price list has associated records (`salesOrders.count > 0 || salesInvoices.count > 0 || counterparties.count > 0`), hard deletion is blocked.
  - Instead, the service performs a soft-deactivation: `prisma.priceList.update({ where: { id }, data: { isActive: false } })`.
  - Archived price lists are excluded from new customer dropdowns and order headers, while preserving historical document line integrity.

### 7. API Surface & Contracts
- **Settings**:
  - `GET /api/v1/tenants/settings` -> Returns `{ sales: { enableMultiTierPriceLists: boolean, allowSellerPriceOverride: boolean } }`.
  - `PATCH /api/v1/tenants/settings` -> Updates tenant settings.
- **Price Lists**:
  - `GET /api/v1/sales/price-lists` -> List of active/all price lists with product price counts.
  - `POST /api/v1/sales/price-lists` -> Creates new price list `{ name: { uz, ru }, currency, isDefault? }`.
  - `PUT /api/v1/sales/price-lists/:id` -> Updates price list metadata, currency, default flag, or active status.
  - `DELETE /api/v1/sales/price-lists/:id` -> Soft-deactivates or deletes price list.
- **Product Prices**:
  - `POST /api/v1/sales/price-lists/:id/items` -> Bulk upserts product prices `{ items: [{ productId: string, price: number }] }`.
  - `GET /api/v1/sales/invoices/pricing/resolve?productId=...&counterpartyId=...&priceListId=...&currency=...&exchangeRate=...` -> Resolves dynamic unit price.

### 8. Frontend UI/UX Architecture
- **Sidebar Integration**: In `Sidebar.tsx`, the `/sales/prices` navigation link is conditionally displayed only when `company.settings?.sales?.enableMultiTierPriceLists === true`.
- **Sales Settings Tab (`/settings/sales`)**: Renders the multi-tier pricing toggle with instant save and AuthContext synchronization.
- **Master-Detail Pricing View (`/sales/prices`)**: Left sidebar with price list selector and creation drawer; right table with inline pricing inputs, auto-calculated discount badges, and bulk save capability.
- **Sales Order Form (`SalesOrderForm.tsx`)**: Auto-selects customer price list, supports header price list dropdown override, auto-calculates line unit prices, and converts foreign currency prices in real time.

## Testing Decisions

Tests must assert user-observable functional outcomes and data invariants across API contracts and UI states without testing internal framework implementation details.

### Test Scenarios & Suites
1. **Dynamic Pricing Resolution (`sales-invoices.service.spec.ts`)**:
   - Verify that when `enableMultiTierPriceLists` is false, `resolveProductPrice` returns base price with 0% discount.
   - Verify that when enabled, customer tier price takes precedence and computes accurate discount percentage.
   - Verify markup percentage computation when tier price exceeds base price.
   - Verify multi-currency conversion when price list is in USD and document is in UZS using document exchange rate.
   - Verify fallback to base price when item is not defined in the tier price list.
2. **Bulk Pricing & Lifecycle Invariants**:
   - Verify `bulkSetPrices` upserts prices and ignores negative or invalid inputs.
   - Verify `updatePriceList` unsets prior default when a new default price list is designated.
   - Verify `deletePriceList` soft-deactivates (`isActive: false`) when referenced by orders, invoices, or counterparties.
   - Verify `deletePriceList` performs hard delete when the price list is unreferenced.
3. **Product Catalog Two-Way Sync**:
   - Verify product queries return `productPrices` so edit drawers load existing tier values.

## Out of Scope

- Volume-based step-ladder pricing (e.g. quantity tiers: 1-9 pcs, 10-49 pcs, 50+ pcs).
- Customer loyalty point accrual, cashback balances, or promo vouchers.
- Automated competitor web-scraping or algorithmic AI repricing.
- Time-bounded seasonal discount schedules with automatic expiration timers.

## Further Notes

- Existing price lists in the database are fully preserved. Activating or deactivating the settings toggle never deletes existing data from `price_lists` or `product_prices`.
- Currency formatting must strictly adhere to the project convention: `formatCurrency(amount, locale, currency)` without double currency suffixes.
