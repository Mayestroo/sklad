# Specification: Boshlang‘ich Qoldiqlar (Opening Balances) Module

## Problem Statement

When an enterprise transitions its operations to Sklad ERP from legacy spreadsheets, desktop 1C databases, or manual paper ledgers, it must establish a reliable, audit-compliant baseline ("cutoff point") of its financial and physical state as of a designated opening date (e.g., October 1, 2026). 

Currently, business operators encounter critical roadblocks during onboarding:
1. **Distortion of Commercial Results**: Without a dedicated opening balance mechanism, cashiers and warehouse managers are forced to simulate initial stock and cash using mock purchase receipts, fake sales invoices, or artificial incoming cash entries. This corrupts financial reporting, artificially inflates monthly turnover, distorts Cost of Goods Sold (COGS), and generates fictitious taxable revenue or expenses.
2. **Fragmented Data Ingestion**: Entering thousands of warehouse inventory lines, customer receivables, supplier payables, advance deposits, physical cash balances, bank accounts, and capitalized fixed assets manually one-by-one is prohibitive and error-prone. Operators lack a unified multi-sheet Excel ingestion pipeline with automated pre-validation and row-specific diagnostic feedback.
3. **Unbalanced Initial Equity**: Enterprises often enter partial opening numbers without balancing total assets against liabilities and owner's equity. This creates ungrounded accounting ledgers where fundamental balance sheet invariants (`Assets = Liabilities + Equity`) are violated from day one.
4. **Lack of Invariant Protection & Post-Onboarding Drift**: Once opening balances are accepted, downstream sales, inventory dispatches, and payments begin consuming those initial batches and funds. If users or administrators arbitrarily alter or delete initial balances retroactively, it produces phantom negative balances, breaks FIFO inventory batch consumption chains, and invalidates historical reconciliation.
5. **No Segregated Tracking for Historical Debts & Advances**: Historical customer receivables and supplier liabilities risk being merged or mishandled as new operational transactions, obscuring genuine trading activity and confusing debt recovery efforts.

---

## Solution

A full-stack, enterprise-grade **Boshlang‘ich Qoldiqlar (Opening Balances) Module** providing a structured, safe, and balanced onboarding gateway into Sklad ERP:

1. **Dedicated Document Entity & Accounting Isolation**:
   - Opening balances are captured in an explicit `OpeningBalanceDocument` with multi-category lines, completely isolated from regular sales, purchases, and operational cash flows.
   - Initial balances do not trigger commercial revenue or expense accounts. In formal accounting, double-entry ledger postings balance through auxiliary NAS Account `00` ("Yordamchi hisobvaraq / Вспомогательный счет 00"), ensuring zero impact on profit and loss (P&L).
2. **Unified Cutoff Date & Multi-Category Coverage**:
   - A company-wide cutoff date (e.g., `01.10.2026`) establishes the enterprise baseline. All operational documents dated prior to the cutoff date are strictly blocked.
   - Supports all 8 enterprise asset and liability categories:
     - **Cash & Bank**: UZS cash registers, USD cash registers, commercial bank checking accounts in UZS/USD.
     - **Inventory & Materials**: Raw materials, merchandise, WIP, finished goods across multiple warehouses with explicit unit cost and batch tracking.
     - **Customer Receivables**: Historical debt per customer and contract without creating mock sales.
     - **Supplier Payables**: Historical debt per supplier and contract without creating mock purchases.
     - **Advances**: Given supplier prepayments (assets) and received customer advance deposits (liabilities).
     - **Fixed Assets**: Machinery, IT hardware, vehicles, and real estate tracking initial historical cost, accumulated depreciation, net book value, useful life, and custodian.
     - **Other Assets & Liabilities**: Tax overpayments/liabilities, employee wage arrears, and other accrued items.
     - **Owner's Equity**: Opening share capital and retained earnings balancing the equation.
3. **Rigorous Balance Control (`Assets = Liabilities + Equity`)**:
   - Real-time mathematical verification: `Total Assets - (Total Liabilities + Initial Equity) == 0`.
   - The document cannot be approved or posted unless the balancing difference is exactly zero.
4. **Multi-Sheet Excel Template & Resilient Ingestion Engine**:
   - Standardized Excel workbook template with dedicated worksheets for each balance category.
   - Two-phase validation pipeline: preview and dry-run with row-specific, localized error reporting (e.g., *"Row 14: Product SKU 'PANEL-36W' not found in catalog"* or *"Row 8: Warehouse 'Asosiy Ombor' missing"*).
5. **Role-Gated Approval & Rollback Invariants**:
   - Three-state document lifecycle: `DRAFT` → `PENDING_REVIEW` → `POSTED`.
   - Normal users cannot alter a posted opening balance document.
   - Reopening (`UNPOST`) is restricted to authorized administrators and strictly protected by the Rollback Invariant: unposting is rejected if any inventory batch has been consumed by subsequent sales or if cash registers have fallen below opening amounts.

---

## User Stories

### Enterprise Onboarding & Setup
1. As an enterprise administrator, I want to set an official opening cutoff date, so that all subsequent business transactions build upon a verified historical baseline.
2. As an administrator, I want the system to reject any regular sales invoice or purchase receipt dated before the opening cutoff date, so that historical baselines cannot be corrupted by backdated entries.
3. As a financial director, I want opening balances to be excluded from monthly sales, purchases, revenue, and expense reports, so that profitability metrics reflect only genuine post-onboarding performance.
4. As a chief accountant, I want initial entries to be recorded against auxiliary Account `00` in the general ledger, so that the balance sheet is established without distorting income statement accounts.

### Cash & Bank Funds (Pul Mablag‘lari)
5. As a cashier, I want to enter opening cash balances for physical UZS and USD registers, so that physical cash is immediately recognized upon go-live.
6. As a finance officer, I want to enter opening commercial bank balances for UZS and foreign currency checking accounts, so that bank reconciliations start from exact actual figures.
7. As a finance officer, I want to specify notes and account identifiers for each cash register and bank account, so that each initial balance is traceable to external bank statements.

### Warehouse & Inventory (Tovar va Materiallar)
8. As a warehouse manager, I want to enter opening physical inventory quantities and unit costs per warehouse, so that initial stock levels are accurate.
9. As a warehouse manager, I want to register opening stock for merchandise, raw materials, WIP, and finished goods, so that inventory classification matches operational usage.
10. As an inventory controller, I want the system to calculate the total line value (`quantity × unitCost`) automatically, eliminating manual calculation errors.
11. As an inventory controller, I want to record distinct batches for the same product at different historical costs, so that FIFO depletion begins with exact historical layers.
12. As a warehouse manager, I want opening inventory to create active `ProductBatch` records without requiring a fictitious purchase receipt, so that batch consumption operates natively.
13. As an inventory manager, I want the system to prevent entering negative quantities or negative unit costs during inventory onboarding.

### Customer Receivables & Advances (Debitorlik va Olingan Avanslar)
14. As a sales director, I want to enter historical customer debts per customer and contract, so that collection efforts can proceed immediately after launch.
15. As a sales director, I want customer opening balances to increment `Counterparty.customerDebt` directly without generating fake sales invoices, preserving commercial clean books.
16. As a sales cashier, I want to record historical customer advances (unallocated prepayments received prior to launch), so that they can be offset against subsequent sales orders or invoices.
17. As a credit controller, I want customer opening balances to reflect in customer reconciliation statements (Akt Sverka) as "Boshlang‘ich qoldiq", establishing a clear starting balance.

### Supplier Payables & Advances (Kreditorlik va Berilgan Avanslar)
18. As a procurement manager, I want to enter historical supplier debts per vendor and contract, so that accounts payable obligations are tracked immediately.
19. As a procurement manager, I want supplier opening balances to increment `Counterparty.supplierDebt` directly without creating fictitious purchase receipts.
20. As an accountant, I want to record historical prepayments given to suppliers, so that future incoming goods receipts can settle against existing advances.
21. As a procurement accountant, I want supplier opening balances to appear on supplier reconciliation statements (Akt Sverka) as "Boshlang‘ich qoldiq".

### Fixed Assets (Asosiy Vositalar)
22. As an asset manager, I want to register existing plant machinery, vehicles, IT equipment, and office furniture with inventory numbers and acquisition dates.
23. As an accountant, I want to enter initial historical purchase cost and accumulated depreciation for each fixed asset, so that the net book value is calculated automatically (`InitialCost - Depreciation`).
24. As an asset manager, I want to record useful lifespan and responsible custodians for each asset, preparing the system for automatic monthly depreciation.
25. As a chief accountant, I want opening fixed assets to populate the corporate Fixed Asset Registry upon document approval.

### Other Balances & Capital Control (Kapital va Balans)
26. As an accountant, I want to record other accrued assets (tax overpayments, advances to employees) and liabilities (tax obligations, unpaid payroll arrears), capturing a comprehensive balance sheet.
27. As a business owner, I want the system to compute total assets and total liabilities across all entered categories in real time.
28. As a business owner, I want the system to propose the balancing equity amount (`Equity = Assets - Liabilities`) or let me assign it to statutory capital and retained earnings.
29. As a financial controller, I want the system to block document approval whenever `Assets != Liabilities + Equity`, ensuring the opening balance sheet difference is zero.

### Excel Import & Bulk Processing
30. As a data onboarding specialist, I want to download a pre-structured, multi-sheet Excel template containing standardized columns for cash, inventory, customers, suppliers, advances, fixed assets, and other items.
31. As an onboarding specialist, I want to upload the completed Excel workbook and receive an instant dry-run validation report detailing invalid rows, unknown SKUs, missing warehouses, or duplicate lines.
32. As a user, I want error messages to specify exact sheet names and row numbers (e.g., *"Sheet 'Tovar', Row 12: SKU 'LED-36W' not found"*), allowing rapid spreadsheet corrections.
33. As an administrator, I want the import engine to perform an atomic staging preview so that no corrupted or partial data enters live records until confirmed.

### Lifecycle, Security & Audit
34. As an operator, I want to save opening balance work as a `DRAFT` so that multiple team members can populate different sections collaboratively over time.
35. As an administrator, I want to submit the document for review (`PENDING_REVIEW`) and lock editing for regular operators while accounting audits the balances.
36. As an administrator, I want to approve and post the opening balance document, atomically propagating stock levels, batches, cash account balances, and counterparty debts.
37. As an administrator, I want a posted opening balance document to be protected from editing or deletion by non-administrative users.
38. As an administrator attempting to unpost/reopen a posted opening balance, I want the system to block the action if any opening inventory batch has been depleted by sales or if cash accounts have been drawn down below opening levels.
39. As an auditor, I want a complete audit log of who created, edited, validated, approved, or reopened opening balance records with full timestamp and payload diffs.

---

## Implementation Decisions

### 1. Database Architecture & Schema Extensions

- **Unified Master Document Model (`OpeningBalanceDocument`)**:
  - Encapsulates the entire enterprise onboarding cutoff for a tenant:
    - `id`, `tenantId`, `docNumber`, `openingDate`, `status` (`DRAFT`, `PENDING_REVIEW`, `POSTED`, `CANCELLED`).
    - `totalAssets`, `totalLiabilities`, `totalEquity`, `balanceDifference`.
    - `createdById`, `approvedById`, `createdAt`, `updatedAt`, `approvedAt`, `notes`.
- **Polymorphic Line Detail Model (`OpeningBalanceLine`)**:
  - Represents individual balance items linked to the master document:
    - `id`, `documentId`, `tenantId`, `category` (enum: `CASH`, `BANK`, `INVENTORY`, `CUSTOMER_DEBT`, `SUPPLIER_DEBT`, `CUSTOMER_ADVANCE`, `SUPPLIER_ADVANCE`, `FIXED_ASSET`, `OTHER_ASSET`, `OTHER_LIABILITY`, `EQUITY`).
    - Polymorphic references: `accountId` (`CashAccount`), `productId` (`Product`), `warehouseId` (`Warehouse`), `counterpartyId` (`Counterparty`), `fixedAssetId` (`FixedAsset`).
    - Numeric values: `quantity` (Decimal 15,3), `unitCost` (Decimal 15,2), `amount` (Decimal 15,2), `accumulatedDepreciation` (Decimal 15,2), `netAmount` (Decimal 15,2).
    - Metadata: `currency`, `exchangeRate`, `batchNumber`, `contractNumber`, `notes`.
- **Fixed Asset Registry Model (`FixedAsset`)**:
  - Introduce core fixed asset entity in the schema:
    - `id`, `tenantId`, `name`, `inventoryNumber`, `assetType`, `acquisitionDate`, `initialCost`, `accumulatedDepreciation`, `netBookValue`, `usefulLifeMonths`, `depreciationMethod`, `custodianUserId`, `status` (`ACTIVE`, `IN_REPAIR`, `DISPOSED`, `WRITTEN_OFF`), `notes`.
- **Import Staging Models**:
  - `OpeningBalanceImportSession`: tracks uploaded file, status, parsing progress, and error summaries.
  - `OpeningBalanceImportError`: stores row index, worksheet name, field name, invalid value, and human-readable diagnostic message.

### 2. Posting Engine & Subsystem Propagation (`OpeningBalanceService`)

When an `OpeningBalanceDocument` transitions from `PENDING_REVIEW` to `POSTED` inside an atomic transaction:
1. **Cash & Bank Propagation**:
   - Increments target `CashAccount.balance` by line amount.
   - Generates an immutable `FinanceTransaction` with direction `INCOME`, transaction type `OPENING_BALANCE`, and status `POSTED`. This transaction is tagged to ensure exclusion from operational cash flow turnover and P&L.
2. **Warehouse & Inventory Propagation**:
   - For each inventory line:
     - Increments `StockLevel.quantity` for the specified `(warehouseId, productId)`.
     - Creates a `ProductBatch` with `receiptId = null`, `batchNumber = line.batchNumber || 'INIT-' + docNumber`, `initialQty = line.quantity`, `remainingQty = line.quantity`, `purchasePrice = line.unitCost`, and `landedCost = line.unitCost`.
3. **Counterparty Debts & Advances Propagation**:
   - For customer receivables: increments `Counterparty.customerDebt` and `Counterparty.debtBalance`.
   - For supplier payables: increments `Counterparty.supplierDebt` and `Counterparty.debtBalance`.
   - For advances: registers starting balances without affecting trade debt balances until operational settlement.
4. **Fixed Assets Propagation**:
   - Creates or activates entries in `FixedAsset` registry with calculated `netBookValue = initialCost - accumulatedDepreciation`.
5. **General Ledger Journal Entries (NAS Account 00)**:
   - Debit Asset accounts (5010, 5110, 2910, 4010, 0100) / Credit Auxiliary Account `00`.
   - Debit Auxiliary Account `00` / Credit Liability & Equity accounts (6010, 6310, 6410, 6710, 8330, 8710).
   - Auxiliary Account `00` nets out to 0.00.

### 3. Rollback & Unpost Guardrails (The Rollback Invariant)

Reopening a posted opening balance document (`UNPOST`) is restricted to enterprise administrators and verified against operational invariants:
- **Inventory Depletion Check**: Reopening is rejected if any batch created by the document has `remainingQty < initialQty` (i.e. consumed by subsequent sales invoices or outbound transfers).
- **Cash Depletion Check**: Reopening is rejected if any affected `CashAccount` has its current balance fall below the amount deposited by the opening balance document.
- **Downstream Operations Integrity**: Once validated, unposting atomically reverses stock levels, product batches, cash account balances, counterparty debt balances, and general ledger journal lines, returning the document to `DRAFT`.

### 4. Excel Import Engine Architecture

- Standardized XLSX file parsing with sheets:
  1. `Pul (Cash & Bank)`
  2. `Tovar (Inventory)`
  3. `Mijozlar (Customer Receivables)`
  4. `Yetkazib_beruvchilar (Supplier Payables)`
  5. `Avanslar (Advances)`
  6. `Asosiy_vositalar (Fixed Assets)`
  7. `Boshqa_qoldiqlar (Other Items)`
- Dry-run validation checks:
  - Required column validation.
  - Entity existence lookups (SKU, Warehouse name, Counterparty PINFL/INN or Name, Cash Account name/code).
  - Format checks: positive numbers, decimal constraints, valid date strings.
  - Duplicate key detection (e.g. same SKU in same warehouse in multiple rows without batch distinction).
- Returns structured JSON response with summary counts and error arrays formatted with sheet and row indices.

---

## Testing Decisions

### What Makes a Good Test
- **Invariant & State Verification**: Tests must verify observable financial and physical states (exact cash account balances, warehouse stock levels, batch remaining quantities, counterparty debts, zero balance difference) rather than internal mock calls.
- **Atomic Rollback Guarantee**: Tests must verify that a failed posting or an unposting reversal leaves the database in its exact original state with zero orphaned records or half-applied balances.
- **Boundary & Validation Stress**: Tests must enforce rejection of negative amounts, unbalanced equity, duplicate batches, and unauthorized unposting attempts.

### Modules to be Tested
1. `OpeningBalancesService`:
   - Full posting cycle: cash, inventory batches, customer/supplier debts, fixed assets, and general ledger entry balance.
   - Mathematical balance validation: rejection when `Assets != Liabilities + Equity`.
   - Rollback Invariant validation: rejection of unposting when inventory batches have been partially consumed.
   - Clean unpost and reversal: successful rollback when no downstream operations have occurred.
2. `OpeningBalancesImportService`:
   - Valid multi-sheet Excel ingestion.
   - Row-specific error generation for missing SKUs, invalid numbers, and non-existent warehouses.
   - Rejection of negative quantities or missing mandatory fields.
3. `OpeningBalancesController`:
   - Endpoint authorization, role gating, status transitions, and payload validation.

### Prior Art
- `backend/src/modules/finance/finance-settlement.spec.ts` (Settlement invariants and safe reversal testing).
- `backend/src/modules/purchases/additional-expense-invariant.spec.ts` (Atomic rollback and landed cost testing).
- `backend/src/modules/purchases/purchases.service.unit.spec.ts` (Document posting lifecycle testing).

---

## Out of Scope

- Automated historical transaction migration (importing years of granular historical invoices, receipts, and order histories line-by-line is replaced by entering net opening balances at the cutoff date).
- Automatic physical barcode scanning during initial inventory intake (handled via batch Excel upload or standard inventory stocktaking documents).
- Online bank statement direct synchronization for opening balance reconciliations (handled via manual opening bank balance input matching official bank statements).
- Automatic tax computation or re-filing on historical periods prior to the cutoff date.

---

## Further Notes

- **Accounting Decoupling**: Cashiers and warehouse operators interact exclusively with business terms (Kassa, Bank, Tovar, Debitorlik, Kreditorlik, Asosiy vosita). Formal NAS chart of accounts (00, 1010, 2910, 0100, 0200, 4010, 6010, 8330) are mapped behind the scenes automatically.
- **Single Master Cutoff**: An enterprise typically creates and posts a single master `OpeningBalanceDocument` during company onboarding. If secondary warehouses or new branches join at later stages, supplementary onboarding documents may be initiated with branch-specific scoping.
