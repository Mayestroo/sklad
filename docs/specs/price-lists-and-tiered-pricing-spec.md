# Specification: Price Lists & Tiered Pricing (Narxlar va Chegirmalar) Moduli va Savdo Sozlamalari Integratsiyasi

## Problem Statement

In wholesale, distribution, and multi-channel trade businesses, companies sell products to diverse client tiers (retail buyers, wholesale/optom distributors, VIP accounts, dealers, and key partner contracts). Previously:
1. **Single-Price Rigidity (Yagona narx cheklovi)**: Products had only one standard base selling price (`salePrice`). Selling to wholesale clients at discounted rates required sales managers to manually adjust and type unit prices line-by-line during order entry, causing high operational friction and human error.
2. **Margin Vulnerability & Unauthorized Discounts (Nazoratsiz narx tushirish)**: Without centralized price categories, sales reps could enter arbitrary prices below allowable trade margins without role authorization.
3. **No Support for Dual Business Modes (Oddiy va B2B rejimlari moslashuvchanligi yo'qligi)**: Small retail businesses require a streamlined, simple interface with a single price without clutter, while expanding B2B operations require multi-tier price lists. The system lacked a company-level configuration toggle to cleanly switch between Simple Mode and Advanced Tiered Pricing.
4. **Disjointed Product Catalog Pricing (Narxlarni boshqarish tarqoqligi)**: Setting tier prices required navigating across multiple screens. Product catalog managers could not set wholesale or VIP prices directly inside the product creation/editing workflow.
5. **Slow Auto-Pricing During Order Entry (Buyurtmada avtomatik narx hisoblash yo'qligi)**: Selecting a customer did not automatically pull their agreed price tier into the order items, slowing down order creation and leading to invoicing disputes.

## Solution

A flexible, full-stack **Price Lists & Tiered Pricing (Narxlar va Chegirmalar)** management system with Company Settings toggling, automated dynamic pricing hierarchy, centralized multi-tier grid management, and deep integration across Counterparties, Catalog, Sales Orders, and Sales Invoices:

1. **Company Sales Settings Toggle (Dual Mode)**:
   - **Simple Mode (Oddiy rejim)**: When `enableMultiTierPriceLists` is disabled, the sidebar menu item `/sales/prices` is hidden, customer price-list selection is bypassed, and all sales documents strictly consume the product's base `salePrice`.
   - **Advanced Tiered Pricing (B2B / Optom rejimi)**: When enabled, `/sales/prices` appears in the sidebar navigation, customers can be assigned dedicated price lists (`priceListId`), and dynamic tier pricing is applied across orders and invoices.
2. **Centralized Price List Master & Matrix View (`/sales/prices`)**:
   - **Left Sidebar**: List of created price lists (e.g. "Asosiy Chakana", "Ulgurji / Optom", "VIP Hamkor", "Diler") with active badges, currency tags, and default indicators, plus a drawer to create new price lists with bilingual names and currency.
   - **Right Data Grid**: Displays all products under the selected price list with Base Price (`salePrice`), Jadval Narxi (Tier Price), auto-calculated Chegirma / Ustama foizi (`% Discount / Markup`), and inline instant price editing.
3. **Product Catalog Card Integration**:
   - When creating or editing a product (`CreateProductDrawer`), the "Narxlar" section dynamically displays input fields for all active Price Lists alongside Base Price when Advanced Tiered Pricing is enabled, allowing one-stop price catalog updates.
4. **Dynamic Auto-Pricing Hierarchy in Sales Orders & Invoices**:
   - Selecting a customer automatically detects their bound `priceListId`.
   - Adding products automatically resolves the applicable unit price following a strict hierarchy:
     1. Customer Tier Price (`ProductPrice` for customer's `priceListId`)
     2. If not specified, Default Company Price List price
     3. If still not specified, Product Base Selling Price (`Product.salePrice`) with 0% discount
   - If the price list currency differs from the document currency, the unit price is converted using the document's operational `exchangeRate`.
5. **Role-Gated Manual Price Override**:
   - Sales reps without the `sales:override_price` permission have read-only price fields locked to the resolved tier price. Authorized managers can manually override prices with audit log tracking and below-cost guardrails.

## User Stories

1. As a business owner, I want to navigate to Settings -> Sales Settings, so that I can configure how my company manages sales pricing.
2. As a business owner, I want to toggle "Enable Multi-tier Price Lists" on or off, so that my team only sees advanced pricing features when our business model requires it.
3. As an operator in a retail-only company, I want Multi-tier Price Lists to be disabled by default, so that my navigation menu and forms remain clean and simple without unnecessary fields.
4. As a sales administrator in a B2B distribution firm, I want to enable Multi-tier Price Lists, so that I can establish custom price categories for wholesale buyers, distributors, and VIP partners.
5. As a sales manager, I want to see the "Narxlar va chegirmalar" menu under the Sales section in the sidebar when the feature is enabled, so that I can access price list management.
6. As a sales manager, I want the "Narxlar va chegirmalar" menu to be completely hidden from the sidebar when the feature is disabled, so that employees are not confused by unused modules.
7. As a sales manager, I want to open `/sales/prices` and view all configured price lists in the left panel, including their names, currencies, and default status.
8. As a sales manager, I want to click "+ Yangi narx jadvali" to create a new price category with Uzbek/Russian names, currency (UZS, USD), and an optional default flag.
9. As a sales manager, I want to designate one price list as the default (`isDefault: true`), so that new customers automatically receive standard baseline terms.
10. As a sales manager, I want to select a price list in the left panel and immediately see all catalog products in the right table with SKU, product name, category, and base price.
11. As a sales manager, I want to see the current tier price for each product in the selected price list table, or an indicator that no custom price is set.
12. As a sales manager, I want the system to automatically calculate and display the discount percentage (`((Base - Tier) / Base) * 100%`) when a tier price is lower than the base price.
13. As a sales manager, I want the system to display positive markup percentages (`+X% Ustama`) when a tier price exceeds the base price (e.g. installment/nasiya price lists).
14. As a sales manager, I want to click inline on a product row in the grid and immediately type a new price, saving it via keyboard enter or checkmark button without full page reloads.
15. As a catalog manager, I want to open the product creation drawer (`CreateProductDrawer`) and see price input fields for all active price lists under the "Narxlar" block.
16. As a catalog manager, I want saving a product in the drawer to persist both the base selling price and all entered tier prices atomically in `ProductPrice`.
17. As a sales representative, I want to create a counterparty (Customer) and select an assigned Price List from a dropdown, so that the customer is permanently mapped to their negotiated price tier.
18. As a sales representative, I want the Price List dropdown on customer creation to be mandatory when Multi-tier pricing is enabled, defaulting to the company's default price list.
19. As a sales representative, I want supplier counterparties (`SUPPLIER`) to be exempt from price list requirements, since price lists only govern customer sales.
20. As a sales representative, I want to create a new Sales Order and pick a customer, so that the system immediately pre-selects the customer's mapped price list on the order header.
21. As a sales representative, I want to add products to the Sales Order and have the system auto-populate the line unit price directly from the customer's price list without manual entry.
22. As a sales representative, I want products without an explicit tier price in that price list to safely fall back to the base `salePrice` without throwing an error or blocking the sale.
23. As a sales representative, I want the system to convert the tier price into order currency using the order's `exchangeRate` when the price list currency (e.g. USD) differs from the order currency (e.g. UZS).
24. As a sales manager with `sales:override_price` permission, I want to manually adjust unit prices on order lines when granted special authority for custom negotiations.
25. As a junior seller without `sales:override_price` permission, I want line unit prices to be read-only, preventing unauthorized discounting.
26. As a warehouse manager converting a Sales Order to a Sales Invoice upon dispatch, I want the invoice to retain the exact agreed prices from the order, ensuring billing consistency.
27. As a business owner, I want disabling Multi-tier Price Lists to preserve all existing `price_lists` and `product_prices` data in the database, so that re-enabling the feature restores previous configurations without data loss.
28. As an auditor, I want all price list creations, tier price updates, and manual price overrides to be recorded in `AuditLog`, ensuring complete price transparency.

## Implementation Decisions

### 1. Settings Architecture & Company Schema
- Multi-tier pricing is controlled via a centralized JSON settings column on the `Company` model:
  ```prisma
  // Added to model Company in schema.prisma
  settings Json? @default("{}")
  ```
- The settings JSON schema structure:
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
  - `GET /api/v1/tenants/settings` — Returns the current tenant's merged company settings.
  - `PATCH /api/v1/tenants/settings` — Updates settings with strict DTO validation (requires `settings:edit` permission).

### 2. Database Models & Relations (Prisma Alignment)
- Sklad ERP uses UUID strings (`String @id @default(uuid())`) and multi-tenant scoping (`tenantId`):
  ```prisma
  model PriceList {
    id          String         @id @default(uuid())
    tenantId    String         @map("tenant_id")
    name        Json           // Bilingual: { uz: string, ru: string }
    currency    String         @default("UZS")
    isDefault   Boolean        @default(false) @map("is_default")
    isActive    Boolean        @default(true) @map("is_active")
    createdAt   DateTime       @default(now()) @map("created_at")
    updatedAt   DateTime       @updatedAt @map("updated_at")

    company     Company        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    prices      ProductPrice[]
    counterparties Counterparty[]
    salesOrders SalesOrder[]
    salesInvoices SalesInvoice[]

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
- `Counterparty` relation: `priceListId String? @map("price_list_id")` and `priceList PriceList?`.

### 3. Dynamic Auto-Pricing Engine Hierarchy
When resolving a product price for a customer and document:
1. Check if `company.settings?.sales?.enableMultiTierPriceLists` is true. If false, return `product.salePrice`.
2. Determine active `priceListId`:
   - Document-level `priceListId` (if explicitly chosen).
   - Customer-level `counterparty.priceListId`.
   - Default company price list where `isDefault: true` and `isActive: true`.
3. Lookup `ProductPrice` matching `(priceListId, productId)`.
4. If found, retrieve `productPrice.price`. If not found, fall back to `product.salePrice`.
5. Currency conversion:
   - If `priceList.currency !== document.currency`, multiply by document `exchangeRate` (e.g. USD price * exchangeRate for UZS document).
6. Return `{ resolvedPrice, basePrice, discountPercent, isFallback }`.

### 4. API Surface & Contracts
- **Settings**:
  - `GET /tenants/settings` -> `{ sales: { enableMultiTierPriceLists: boolean, ... } }`
  - `PATCH /tenants/settings` -> Updated settings object
- **Price Lists**:
  - `GET /sales/price-lists` -> List of price lists with item price counts
  - `POST /sales/price-lists` -> Create new price list `{ name: { uz, ru }, currency, isDefault? }`
  - `PATCH /sales/price-lists/:id` -> Update name, status, default flag
  - `DELETE /sales/price-lists/:id` -> Soft delete or guard against deletion if bound to active orders
- **Product Prices & Bulk Operations**:
  - `POST /sales/price-lists/:id/items` -> Bulk set prices: `{ items: [{ productId: string, price: number }] }`
  - `POST /sales/price-lists/:id/prices/:productId` -> Single price upsert: `{ price: number }`
  - `GET /sales/products/:productId/price?counterpartyId=...&priceListId=...&currency=...` -> Dynamic resolved price evaluation endpoint

### 5. Frontend UI/UX Architecture
- **Sidebar Integration**:
  - In `Sidebar.tsx`, the `/sales/prices` navigation item is conditionally filtered out unless `company.settings?.sales?.enableMultiTierPriceLists === true`.
- **Settings Page (`/settings/sales`)**:
  - Dedicated sales settings tab containing the toggle: "Ko'p darajali narxlar va chegirma jadvallaridan foydalanish (Enable Multi-tier Price Lists)".
  - Instant save with optimistic UI update and synchronization with auth context.
- **Master-Detail Pricing View (`/sales/prices`)**:
  - Split view: Left sidebar (list of lists, active toggle, create drawer) + Right grid (searchable products, SKU, category, Base Price, Tier Price, auto-calculated Discount/Markup badge, inline edit with keyboard shortcuts).
- **Product Drawer (`CreateProductDrawer.tsx`)**:
  - When multi-tier pricing is enabled, renders accordion/table of active price lists under the "Sotish narxlari" section. Submitting creates/updates `ProductPrice` records in parallel.

## Testing Decisions

Tests must assert user-observable functional outcomes and data invariants across API contracts and UI states without testing internal NestJS or React implementation details.

### Test Scenarios & Suites
1. **Settings Toggle Enforcement**:
   - Verify that with toggle OFF, `GET /sales/products/:id/price` returns `product.salePrice` regardless of customer `priceListId`.
   - Verify that with toggle ON, `GET /sales/products/:id/price` returns the specific `ProductPrice.price`.
2. **Dynamic Price Fallback Hierarchy**:
   - Verify tier price takes precedence when set.
   - Verify safe fallback to base `salePrice` when tier price is null/unset.
   - Verify currency conversion when price list is in USD and order is in UZS.
3. **Bulk Upsert & Concurrency**:
   - Verify `POST /sales/price-lists/:id/items` correctly upserts new prices and updates existing records in a single database transaction.
4. **Counterparty Price List Assignment**:
   - Verify creating customer with `priceListId` binds correctly and validates foreign key.
   - Verify customer creation enforces priceListId when toggle is ON.
5. **Sales Order Auto-Pricing**:
   - Verify changing counterparty in `SalesOrderForm` updates line item unit prices to the customer's tier prices.

## Out of Scope

- Volume-based step-ladder pricing (e.g. $10 for 1-9 pcs, $8 for 10-49 pcs, $6 for 50+ pcs on a single order line).
- Time-limited promotional discount coupons and promo codes.
- Customer loyalty point accrual and cashback balances.
- Automatic competitor price scraping or AI algorithmic dynamic repricing.

## Further Notes

- Existing price lists in the database are fully preserved. Activating or deactivating the settings toggle never drops data from `price_lists` or `product_prices`.
- Currency formatting must strictly adhere to the project convention: `formatCurrency(amount, locale, currency)` without double currency suffixes.
