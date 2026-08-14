## Problem Statement

Small and medium enterprises in Uzbekistan struggle with complex, cumbersome accounting interfaces (such as legacy 1C systems) when registering incoming goods from suppliers. Operators frequently make errors calculating landed costs (including freight, customs, and brokerage), managing VAT according to local tax regimes, tracking supplier payables across multiple currencies, and updating inventory valuation. Businesses need an intuitive, fast operational workflow where non-accountant warehousemen and purchase managers can record receipts effortlessly, while the system strictly and automatically enforces double-entry accounting (BHMS/NAS), FIFO batch valuation, and payment settlements behind the scenes.

## Solution

A high-performance, user-friendly Purchases Module (`Xaridlar Bo‘limi`) featuring:
1. **Simplified Inbound Workflow**: Fast purchase receipt entry with barcode scanning, auto-populating active contracts and last purchase prices, and inline quick-add modals for missing products and suppliers.
2. **Pre-Inbound Landed Cost Engine**: Automated allocation of ancillary direct expenses (transport, customs, brokerage) by amount, quantity, or weight directly onto line-item unit costs prior to warehouse posting.
3. **Orthogonal State Machine**: Independent tracking of Document lifecycle (`DRAFT`, `POSTED`, `CANCELLED`), Payment settlement (`UNPAID`, `PARTIALLY_PAID`, `PAID`), and Return status (`NONE`, `PARTIALLY_RETURNED`, `FULLY_RETURNED`).
4. **Automated Accounting & Multi-Currency**: Seamless backend generation of National Accounting Standards (BHMS) double-entry records (Debit 2910/1010, Debit 4410, Credit 6010) with automatic currency exchange difference recognition on payment settlement, hidden from general operators and visible to accountants.
5. **Robust Rollback Guardrails**: Enforcing invariants preventing unposting or document deletion when downstream stock has already been dispatched via sales or financial settlements have occurred.

---

## User Stories

1. As a Purchase Manager, I want to create a new purchase receipt as a Draft, so that I can prepare the incoming order details before goods physically arrive.
2. As a Purchase Manager, I want to select a supplier from an autocomplete list with their current debt balance displayed, so that I immediately know our financial relationship with them.
3. As a Purchase Manager, I want to quickly add a new supplier via a modal popup without leaving the purchase receipt screen, so that I do not lose my draft data.
4. As a Purchase Manager, I want the system to auto-populate the active contract when a supplier is selected, so that I don't have to manually look up agreement numbers.
5. As a Purchase Manager, I want to select a target warehouse in the document header, so that all items in this receipt are received into the correct physical location.
6. As a Purchase Manager, I want to scan product barcodes using a handheld scanner, so that items are instantly added to the purchase table or their quantities incremented.
7. As a Purchase Manager, I want the system to auto-fill the last purchase price for a product from the selected supplier, so that I don't have to re-enter recurring prices manually.
8. As a Purchase Manager, I want to create a new product inline via a quick-add modal directly from the items table, so that uncataloged goods can be entered on the spot.
9. As a Purchase Manager, I want to specify line-item discounts and VAT rates, so that the line totals and invoice totals match the physical tax invoice.
10. As an Accountant, I want the system to check if our company is registered as a VAT payer, so that input VAT is correctly separated into asset account 4410 or capitalized directly into product landed cost.
11. As a Purchase Manager, I want to attach direct purchase expenses (such as freight, customs duties, and brokerage) to the draft receipt, so that the true acquisition cost is captured.
12. As a Purchase Manager, I want to choose the expense allocation method (By Amount, By Quantity, or By Weight) for each expense, so that costs are distributed fairly across diverse goods.
13. As a Storekeeper, I want to review the draft receipt and click "Omborga kirim qilish" (Post Receipt), so that inventory stock levels increase and product batches are generated.
14. As a Storekeeper, I want the system to create a Product Batch with initial quantity, remaining quantity, purchase price, and calculated landed cost upon posting, so that FIFO sales valuation accurately reflects true costs.
15. As a Storekeeper, I want the system to automatically update the default catalog cost price (`Product.costPrice`) upon posting, so that standard prices stay current with market changes.
16. As an Accountant, I want posting a receipt to automatically increase the supplier's debt balance (`Counterparty.debtBalance`), so that accounts payable are always up to date.
17. As an Accountant, I want posting a receipt to automatically generate BHMS double-entry journal lines (Debit 2910, Debit 4410, Credit 6010), so that general ledger reporting requires no manual journal entry.
18. As a Financial Officer, I want to record payments against specific purchase receipts or as general supplier advances from the Finance module, so that cash/bank balances decrease and supplier debt is settled.
19. As a Financial Officer, I want multi-currency purchases in USD to recognize exchange differences automatically when paid at a different exchange rate, so that FX gain/loss entries (9620/9430) are balanced.
20. As a Storekeeper, I want to create a Purchase Return against a posted receipt, so that damaged or defective items are removed from warehouse stock and returned to the supplier.
21. As an Accountant, I want a purchase return to reduce outstanding supplier debt or establish a supplier advance credit if the receipt was already paid, so that financials remain accurate.
22. As an Administrator, I want the system to block unposting or modifying a purchase receipt if any of the received stock has already been sold or if payments have been applied, so that inventory and ledger integrity cannot be broken.
23. As an Executive, I want to view a comprehensive list of all purchases with rich filtering by date, supplier, warehouse, currency, and payment status, so that I can monitor procurement volume and pending liabilities.
24. As an Executive, I want to view a supplier 360-degree profile showing total purchases, total payments, net debt, and purchase history, so that I can evaluate vendor partnerships effectively.

---

## Implementation Decisions

- **Domain Model & Vocabulary**:
  Strictly adheres to `CONTEXT.md` terms (`Purchase Receipt`, `Purchase Expense`, `Expense Allocation Method`, `Landed Cost`, `Product Batch`, `Purchase Return`, `Supplier Debt`, `Supplier Advance`, `Rollback Invariant`, `Automatic Journal Posting`). Avoids deprecated terms (`Purchase Order`, `Inbound Invoice`, `Vendor Credit`).

- **Orthogonal Status State Machine (ADR-0001)**:
  Purchase receipts maintain three independent status axes:
  - Document status: `DRAFT`, `POSTED`, `CANCELLED`
  - Payment status: `UNPAID`, `PARTIALLY_PAID`, `PAID`
  - Return status: `NONE`, `PARTIALLY_RETURNED`, `FULLY_RETURNED`

- **Pre-Inbound Landed Cost Locking (ADR-0002)**:
  Direct expenses are attached and allocated to line items prior to posting. Once posted, `landedCost` is locked into the resulting `ProductBatch` records to prevent retroactive revaluations on consumed inventory.

- **Tax Regime Adaptive VAT Handling (ADR-0003)**:
  When a tenant is marked as a VAT payer (`vatPayer = true`), input VAT debits account `4410` and is excluded from landed cost. For non-VAT payers, input VAT is added directly to unit landed cost and stock valuation.

- **Inventory Rollback Guardrail (ADR-0004)**:
  Unposting (`unpostReceipt`) is rejected if:
  1. `paidAmount > 0` or linked payments exist.
  2. Any active `PurchaseReturn` documents exist.
  3. The current `stockLevel.quantity` in the warehouse is less than the receipt line quantity (indicating stock was sold or transferred).

- **Single Target Warehouse (ADR-0005)**:
  Document header defines one `warehouseId`. Cross-facility allocations are handled via subsequent stock transfers.

- **Automated BHMS Accounting Postings (ADR-0006)**:
  Posting/unposting/returns generate double-entry `JournalEntry` and `JournalLine` records for accounts `2910` (Goods), `4410` (Input VAT), `6010` (Accounts Payable), `5110`/`5010` (Bank/Cash), and `9620`/`9430` (Exchange rate differences). These are hidden from regular UI and displayed to accountants via collapsible audit sections.

- **Product Catalog Cost Price Synchronization (ADR-0007)**:
  Upon posting, `Product.costPrice` updates to the receipt's unit price while batch valuation remains tied to `ProductBatch`.

---

## Testing Decisions

- **Testing Philosophy**:
  Tests must verify external business behavior and domain invariants rather than private internal implementation details.
- **Primary Seam**:
  NestJS service integration level (`PurchasesService` integrated with test PostgreSQL database and `AccountingReportsService`).
- **Prior Art**:
  `backend/src/modules/purchases/purchase-invariant.spec.ts` serves as the primary testing template, verifying:
  - Draft creation and calculation.
  - Expense allocation algorithms (amount, quantity, weight).
  - Receipt posting: stock increase, batch creation, debt increase, BHMS journal entries.
  - Invariant enforcement: preventing unpost when stock is consumed.
  - Purchase returns and debt/advance recalculation.
  - Multi-currency payment linking and FX variance recognition.

---

## Out of Scope

- Multi-step approval workflows (e.g. multi-tier manager sign-offs before warehouse receipt).
- Automated electronic invoice synchronization with Didox/Soliq APIs (reserved for a dedicated integration module).
- Consignment sales and commission inventory.
- Retroactive cost adjustment entries for expenses arriving weeks after inventory depletion (handled via manual adjustment vouchers in GL).

---

## Further Notes

- Frontend UI is built on Next.js (`frontend/src/app/[locale]/(dashboard)/purchases`) using modern, responsive design with clear status badges, keyboard-friendly data entry, and modal-based quick addition.
