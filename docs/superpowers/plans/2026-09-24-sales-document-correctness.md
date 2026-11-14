# Sales Document Correctness Implementation Plan

> **For agentic workers:** Use the inline `executing-plans` workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new sales-order and invoice amounts currency-correct, VAT-complete, editable while drafts, and consistent through partial dispatch and returns.

**Architecture:** Persist the currency of each product's base sale price. Sales forms use that price and convert it to the document currency using the document exchange rate; price-list records remain available for historical documents but are not selected or applied to new sales forms. Orders, partial-dispatch invoices, invoices, and returns share one percentage-discount and line-VAT calculation; FIFO COGS stays in UZS for inventory accounting while profit is stored/displayed in document currency.

**Tech Stack:** TypeScript, NestJS 11, Prisma 7, PostgreSQL, Jest, React 19, Next.js 16.

## Global Constraints

- Supported document and product-price currencies are exactly `USD` and `UZS`.
- Existing product prices are migrated only from a valid `Company.settings.sales.defaultCurrency`; unrecoverable currency stays null and is reported, never silently guessed.
- Preserve existing price-list models, records, and historical document links; new sales forms do not expose or apply price-list selection.
- `discount` on a sales line is a percentage in the inclusive range 0–100; stored line `totalPrice` is the post-discount amount including VAT.
- `subtotalAmount` is before discount, `discountAmount` is the monetary discount, `vatAmount` is the calculated tax, and `totalAmount = subtotalAmount - discountAmount + vatAmount`.
- Returns reproduce the original invoice line's price, discount, and VAT rates, prorated by returned quantity; the resulting return amount includes VAT.
- FIFO COGS and inventory journal entries remain in UZS. Gross profit is net sales revenue excluding VAT minus COGS converted to the document currency by the source document's exchange rate.
- Draft invoice updates do not post stock, ledger, or accounting effects. Posting remains an explicit operation.

---

## File Map

### Product price currency

- `backend/prisma/schema.prisma` — nullable `Product.salePriceCurrency` for backfill exceptions; required for new nonzero sale prices through the service contract.
- `backend/prisma/migrations/20260924000200_sales_price_currency/migration.sql` — add sale-price currency, backfill valid defaults, and report unresolved products.
- `backend/prisma/migrations/20260924000300_sales_order_vat_and_return_vat/migration.sql` — add sales-order and return-line VAT fields.
- `backend/src/modules/inventory/dto/create-product.dto.ts`, `update-product.dto.ts` — validate optional explicit price currency.
- `backend/src/modules/inventory/products/products.service.ts` and `.spec.ts` — resolve new-product currency from explicit input or company sales default; reject unresolved nonzero prices.
- `frontend/src/components/products/CreateProductDrawer.tsx` — display and submit sale-price currency.
- `frontend/src/hooks/useDocumentDropdowns.ts` — include `salePriceCurrency` in product options.

### Sales order and invoice forms/pricing

- `frontend/src/components/sales/SalesOrderForm.tsx` — initialize document currency from company settings; use native product-price currency; remove price-list state/auto-selection.
- `frontend/src/components/sales/order-form/OrderGeneralInfo.tsx` — remove the price-list selector while retaining currency and exchange-rate fields.
- `frontend/src/components/sales/SalesInvoiceForm.tsx` — remove price-list fetch/selector/auto-selection; use native product-price currency and document currency.
- `backend/src/modules/sales/invoices/sales-invoices.service.ts` — resolve base sale-price currency and reject unresolved prices; retain historical price-list APIs.

### Discounts, VAT, partial dispatch, and returns

- `backend/prisma/schema.prisma` — add sales-order header VAT and sales-order/return line VAT fields.
- `backend/src/modules/sales/dto/create-sales-order.dto.ts`, `create-sales-invoice.dto.ts`, `create-sales-return.dto.ts` — validate percentage discounts and VAT rates.
- `backend/src/modules/sales/orders/sales-orders.service.ts` and `.spec.ts` — calculate percentage discounts, VAT, and partial-dispatch invoice totals consistently.
- `backend/src/modules/sales/invoices/sales-invoices.service.ts` and `.spec.ts` — calculate invoice amounts consistently and derive return VAT from original invoice lines.
- `frontend/src/components/sales/order-form/OrderItemsTable.tsx`, `OrderTotalsSummary.tsx` — edit/display order line VAT and VAT-inclusive totals.
- `frontend/src/components/sales/SalesOrderForm.tsx`, `SalesInvoiceForm.tsx` — preserve line discount/VAT percentages in payloads.
- `frontend/src/components/sales/CreateSalesReturnModal.tsx` — show the returnable line's discount/VAT and VAT-inclusive return amount.

### Draft invoice update and profit reporting

- `backend/src/modules/sales/invoices/sales-invoices.controller.ts` — expose `PATCH /sales/invoices/:id` for draft edits.
- `backend/src/modules/sales/invoices/sales-invoices.service.ts` — implement transactional draft-only invoice replacement/update and currency-correct gross profit.
- `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts` — draft-only update, VAT/discount, COGS conversion, and summary regressions.
- `backend/src/modules/sales/orders/sales-orders.service.ts` and `.spec.ts` — partial-dispatch gross profit in invoice currency.
- `frontend/src/app/[locale]/(dashboard)/sales/page.tsx` — display sales profit by document currency without relabeling UZS profit as USD.

---

### Task 1: Persist product sale-price currency and backfill recoverable history

**Interfaces:** `Product.salePriceCurrency?: 'USD' | 'UZS' | null` for historical reads. New product creation resolves the field from explicit input or `company.settings.sales.defaultCurrency`; a nonzero price without a recoverable supported currency fails.

- [ ] **Step 1: Add failing product service tests**

In `backend/src/modules/inventory/products/products.service.spec.ts`, assert that explicit USD/UZS input persists, omitted input uses the tenant's valid sales default, an unsupported/missing default rejects a nonzero sale price, and updating only `salePrice` preserves the saved price currency.

- [ ] **Step 2: Run the focused product test**

Run from `backend`: `npm test -- --runInBand --runTestsByPath src/modules/inventory/products/products.service.spec.ts`.
Expected: new cases fail because Product and DTOs do not yet carry sale-price currency.

- [ ] **Step 3: Add the nullable schema field and additive migration**

Add nullable `salePriceCurrency` mapped to `sale_price_currency`. In the migration, backfill only when `Company.settings->'sales'->>'defaultCurrency'` is `USD` or `UZS`; leave all other products null and emit a migration notice listing unresolved nonzero-price products. Add a check constraint allowing only USD/UZS/null.

- [ ] **Step 4: Implement create/update currency resolution**

Add `salePriceCurrency` to both DTOs and validate it with `IsValidCurrency`. In `ProductsService.create`, load the tenant sales default and resolve explicit input before it; reject if the price is nonzero and no supported currency is available. In update, set the currency only when supplied and reject changing a nonzero price on a product whose currency is still unresolved.

- [ ] **Step 5: Add a currency field to product create/edit UI**

Use `CURRENCY_OPTIONS`. New products initialize from the tenant sales default; edits initialize from `productToEdit.salePriceCurrency`, leaving unresolved legacy prices blank until selected. Submit `salePriceCurrency` with create/update and preserve the existing price-list editor separately.

- [ ] **Step 6: Run product tests, Prisma validation, and backend build**

Run from `backend`: `npm test -- --runInBand --runTestsByPath src/modules/inventory/products/products.service.spec.ts`, `npx prisma validate`, and `npm run build`.

### Task 2: Make sales forms use the product's native price currency

**Interfaces:** A sales line's `unitPrice` is always in the selected sales document currency. Resolve it from `Product.salePrice` and `Product.salePriceCurrency`; convert USD→UZS by multiplying the document exchange rate and UZS→USD by dividing it. No default currency is applied to an unresolved product price.

- [ ] **Step 1: Add failing price-conversion tests**

Add tests for same-currency values, USD→UZS, UZS→USD, unsupported currency, and a product with missing price currency. Assert conversion uses the document's current exchange rate and round-trips within the stored two-decimal precision.

- [ ] **Step 2: Replace the sales-form price-list selector and resolver**

Remove the `priceListId` selector and counterparty auto-price-list behavior from Sales Order and Sales Invoice forms, but do not remove saved historical price-list fields or APIs. Use `salePriceCurrency` for base price resolution; display a repair error rather than showing a missing-currency price with a guessed label. Initialize new document currency with `useDefaultCurrency()`.

- [ ] **Step 3: Make backend price resolution use `salePriceCurrency`**

Update `SalesInvoicesService.resolveProductPrice` to return the base price with its saved currency and convert only with a valid requested exchange rate. Keep existing price-list endpoints for administrative/history use; sales create/edit forms no longer call them.

- [ ] **Step 4: Run sales price and form checks**

Run from `backend`: `npm test -- --runInBand --runTestsByPath src/modules/sales/invoices/sales-invoices.service.spec.ts src/modules/sales/orders/sales-orders.service.spec.ts`. Run `npm run build` from `frontend`.

### Task 3: Align percentage discounts and VAT across order, invoice, dispatch, and return

**Interfaces:** `SalesOrderItemDto` carries `discount` and `vatRate` percentages; persisted order lines carry `discount`, `vatRate`, `vatAmount`, and VAT-inclusive `totalPrice`. Sales Return lines preserve `discount`, `vatRate`, and prorated `vatAmount` from the original invoice.

- [ ] **Step 1: Add failing order/invoice calculation tests**

Cover a line with quantity 2, unit price 100, 10% discount, and 12% VAT: subtotal 200, discount 20, VAT 21.6, total 201.6. Assert header totals equal the sum of line amounts. Cover zero VAT and 100% discount.

- [ ] **Step 2: Add schema and DTO fields**

Add `SalesOrder.vatAmount`; add `SalesOrderItem.vatRate` and `vatAmount`; add `SalesReturnItem.discount`, `vatRate`, and `vatAmount`. Generate the second additive migration. Extend DTO validation to require discounts and VAT rates between 0 and 100 when present.

- [ ] **Step 3: Calculate order discounts and VAT consistently**

For every line, compute `raw = quantity * unitPrice`, `discountAmount = raw * discountPercent / 100`, `vatAmount = (raw - discountAmount) * vatRate / 100`, and `totalPrice = raw - discountAmount + vatAmount`. Apply the same formulas in both order create and draft update. `discountAmount` on the header is the monetary sum, not the sum of percentage values.

- [ ] **Step 4: Propagate order VAT through each partial dispatch**

For dispatch quantity `q`, use `raw = q * unitPrice`, `discountAmount = raw * discountPercent / 100`, and `vatAmount = (raw - discountAmount) * vatRate / 100`. Copy rates/amounts into the generated invoice lines, set invoice header VAT, and use the VAT-inclusive total for settlement and paid-status calculations.

- [ ] **Step 5: Correct invoice discount and VAT calculations**

Use the same percentage formula in `createInvoice`; persist discount percent and VAT rate per line, `vatAmount` per line, and VAT-inclusive `totalPrice`. Ensure header totals are derived from lines and invoice settlement remains based on `totalAmount` including VAT.

- [ ] **Step 6: Return original discounted/VAT-inclusive amounts proportionally**

Returnable-item API includes source-line discount and VAT rates. Return UI totals use the source line's effective value; backend re-derives amounts from the original invoice line instead of trusting the client-supplied price. Persist prorated return VAT and use gross return amount in settlement reversal.

- [ ] **Step 7: Add partial-dispatch and return regressions**

Assert two partial shipments sum exactly to the source order's discounted taxable base and VAT; a partial return reverses the corresponding line net and VAT proportion without exceeding returned quantity.

- [ ] **Step 8: Run the focused sales tests and schema validation**

Run from `backend`: invoice, order, and return Jest specs plus `npx prisma validate`; run the frontend production build.

### Task 4: Add draft invoice PATCH support

**Interface:** `PATCH /api/sales/invoices/:id` accepts `Partial<CreateSalesInvoiceDto>` but is valid only for DRAFT invoices. It recalculates all line/header totals and does not post stock, ledger, or journal effects.

- [ ] **Step 1: Add failing controller/service tests**

Cover successful draft update, missing invoice, rejecting POSTED/CANCELLED invoice edits, and rollback when replacing items fails. Assert no inventory, ledger, or accounting calls occur.

- [ ] **Step 2: Add the PATCH route**

Add `@Patch('invoices/:id')` guarded by `sales:create`, pass current tenant/user and validated DTO to a draft-only service method.

- [ ] **Step 3: Implement atomic draft replacement**

In one Prisma transaction, load and lock the tenant-owned invoice, require DRAFT, validate supported currency/exchange rate/lines, recalculate invoice totals with Task 3 formulas, replace invoice items, preserve invoice number and creation metadata, and return the refreshed invoice.

- [ ] **Step 4: Verify the existing Sales Invoice form save path**

Keep its `PATCH /sales/invoices/:id` request, check that editing and saving a draft no longer returns 404/405, and ensure posted invoices continue through explicit post/unpost operations.

- [ ] **Step 5: Run invoice service/controller tests and frontend build**

Run focused invoice Jest specs, `npm run build` from backend, and `npm run build` from frontend.

### Task 5: Keep sales profit in document currency

- [ ] **Step 1: Add failing profit currency tests**

For an USD invoice with exchange rate 12,000, net revenue USD 100, and FIFO COGS UZS 600,000, assert gross profit is USD 50; for UZS documents, assert no conversion. Assert VAT is excluded from profit.

- [ ] **Step 2: Convert COGS only for document-currency profit**

Keep `totalCogs` and accounting journal inventory/COGS lines in UZS. Compute `cogsInDocumentCurrency = totalCogs / exchangeRate` for USD (identity for UZS), and `grossProfit = totalAmount - vatAmount - cogsInDocumentCurrency`. Apply the same rule to line gross profit and partial-dispatch invoices.

- [ ] **Step 3: Make summaries display profit by document currency**

Group gross profit by each invoice's `currency`; remove labels that present an unconverted UZS profit as USD. Continue to report operating sales expenses separately in the later Sales Expense workstream.

- [ ] **Step 4: Run sales profit tests and frontend build**

Run focused invoice/order specs and the frontend production build.

## Execution Status

- This plan has not been executed yet. The sales-and-debt settlement-ledger phase is committed in `32a067c`.
- The separate zero-overwrite numeric-entry workstream, sales-expense table, and opening-balance/warehouse/Finance-expense fixes remain in the accepted follow-on sequence.
