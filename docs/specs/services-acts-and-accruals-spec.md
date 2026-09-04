# Specification: Service Acts and Accruals Module (Moliya Modulidan Ajratilgan Arxitektura)

## Problem Statement

In trading, distribution, and manufacturing enterprises, companies routinely engage in service-based operations alongside physical goods movement:
1. **Services Rendered (Ko'rsatilgan xizmatlar)**: Freight delivery, equipment installation, consulting, maintenance, custom packaging, or commission work provided to customers.
2. **Services Received (Olingan xizmatlar)**: Office/warehouse rent, marketing and advertising campaigns, cloud server hosting, legal services, utility bills, and third-party logistics.

Previously:
- **Conflation of Accrual and Cash**: Many workflows either forced cash/bank collection directly inside the operational document or recorded service costs only as raw cash payouts in the cashbook. This violated the fundamental accounting principle of accrual (accruing debt when the service is accepted, irrespective of when payment occurs).
- **Lack of Formal Contractual Documents (Dalolatnoma / Akt)**: Businesses could not generate or track standardized service acts of completion with line items, units of measurement, and VAT breakdown.
- **Counterparty Balance Distortion**: Unsettled service transactions were not properly reflected in counterparty accounts receivable (`Customer Debt`) or accounts payable (`Supplier Debt`), causing reconciliation discrepancies between operational managers and accountants.
- **Zero Double-Entry Journaling**: Service transactions lacked automated National Accounting Standards (BHMS/NAS) ledger postings (Accounts 4010, 6010, 9030, 9420, 6410, 4410), requiring manual journal entries by accountants.
- **Coupled Cash Registers**: Mixing payment buttons into the services screen violated separation of concerns, giving non-finance operators accidental access to cash drawers and bank balances.

## Solution

A decoupled, full-stack **Services Management Module** (`Service Acts & Accruals`) architecturally separated from cash movement, where:
1. **Strict Separation of Concerns**: The Services module records solely the operational reality and monetary accrual of services rendered (`PROVIDED`) or received (`RECEIVED`). It contains zero cash drawer or bank balance mutation buttons.
2. **Automated Accrual & Balance Realignment**:
   - Posting a `PROVIDED` act increases Customer Debt (`Receivables / Debitorlik`) and records service revenue.
   - Posting a `RECEIVED` act increases Supplier Debt (`Payables / Kreditorlik`) and records operational expense.
3. **Decoupled Finance Module Reconciliation**: Cash and bank settlements are initiated and recorded exclusively in the **Finance module** (`FinanceTransaction`). Income or expense transactions referencing the service act atomically increment `paidAmount` and update the act's `paymentStatus` (`UNPAID` → `PARTIALLY_PAID` → `PAID`).
4. **Service Rollback Invariant**: A posted service act cannot be deleted or unposted if linked finance payments exist.
5. **National Accounting Standards Integration**: Posting automatically generates dual-entry journal entries (`JournalEntry`) in compliance with Uzbekistan BHMS/NAS standards.
6. **Catalog Integration with Free-Text Flexibility**: Line items link to the unified nomenclature catalog (`Product` with `type = SERVICE`), automatically pulling standard unit prices, measurement units, and VAT rates, while allowing inline customization of descriptions.

## User Stories

1. As a sales/operations manager, I want to view a dedicated "Xizmatlar" (Services) navigation menu with tabs for "Ko'rsatilgan xizmatlar" (Provided) and "Olingan xizmatlar" (Received), so that I can easily navigate all service acts.
2. As an operations manager, I want to see a filterable data table of service acts displaying act number, date, counterparty, act type, total amount, paid amount, payment status, operational status, and author, so that I can quickly monitor outstanding service commitments.
3. As an operations manager, I want to filter the service acts list by date range, counterparty, payment status (`UNPAID`, `PARTIALLY_PAID`, `PAID`), and operational status (`DRAFT`, `POSTED`, `CANCELLED`), so that I can locate specific records immediately.
4. As a sales manager, I want to click "Yangi ko'rsatilgan xizmat" (New Provided Service Act) to open a creation form, so that I can bill a customer for delivery, repair, or consulting services.
5. As a sales manager, I want to select a customer from the counterparty search dropdown, so that the service act is legally and financially linked to their account.
6. As a sales manager, I want to add line items by selecting services from the catalog (`ProductType = SERVICE`), so that predefined units of measure, default rates, and VAT configurations auto-fill.
7. As a sales manager, I want to adjust quantity, unit price, and add detailed descriptions to each service line (e.g. "Toshkent-Samarqand reysi, 3 tonna yuk"), so that the customer receives a clear and precise act of completion.
8. As a sales manager, I want the system to calculate line subtotals, VAT amounts, and document grand totals automatically, so that arithmetic mistakes are eliminated.
9. As an operations manager, I want to click "Yangi olingan xizmat" (New Received Service Act) to record vendor services (e.g. office rent, marketing, internet, software licenses), so that our company's accounts payable reflect incoming vendor invoices.
10. As an operations manager, I want to select an existing vendor and optionally input their external invoice/act number and invoice date, so that our internal record matches the vendor's physical paper document.
11. As an operator, I want to save a service act as `DRAFT`, so that I can verify details or await counterparty confirmation before committing financial debts.
12. As an operator, I want to edit line items, counterparties, or notes on a `DRAFT` act, so that errors can be corrected freely before posting.
13. As an operator, I want to click "Tasdiqlash" (Post / Confirm) on a verified act, so that counterparty debt is accrued and accounting ledgers are permanently updated.
14. As an accountant, I want posting a `PROVIDED` act to atomically debit Customer Receivables (Account 4010) and credit Service Revenue (Account 9030) and VAT Payable (Account 6410), so that revenue and tax obligations are recognized on an accrual basis.
15. As an accountant, I want posting a `RECEIVED` act to atomically debit Administrative/Selling Expenses (Account 9420/9430) and Input VAT (Account 4410), and credit Supplier Payables (Account 6010), so that company expenses are recognized accurately.
16. As an operations manager, I want the Services module to contain NO cashbox or bank payment buttons, so that operational personnel cannot bypass cash management protocols.
17. As an operations manager viewing a posted service act, I want to see a clear "Moliya to'lovi kiritish" (Record Finance Payment) shortcut button, so that I can navigate to the Finance module with pre-filled document context.
18. As a cashier/accountant in the Finance module, I want to record an Income transaction (`TransactionDirection.INCOME`) and select `sourceDocType: 'ServiceAct'` along with the customer's open service act, so that money received in the cash drawer or bank account reconciles the service debt.
19. As a cashier/accountant in the Finance module, I want to record an Expense transaction (`TransactionDirection.EXPENSE`) and select `sourceDocType: 'ServiceAct'` along with the vendor's open service act, so that money disbursed settles our debt.
20. As a cashier, I want to make partial payments against a service act, so that the act's `paidAmount` increments and its `paymentStatus` transitions to `PARTIALLY_PAID`.
21. As a cashier, I want the act's `paymentStatus` to transition automatically to `PAID` when cumulative finance payments equal or exceed the document's total amount, so that the account is marked settled without manual status toggling.
22. As an accountant, I want to view a printed/PDF version of the "Xizmatlar ko'rsatish dalolatnomasi" (Certificate of Completed Work / Act) formatted according to standard business document norms in Uzbekistan, including signature and stamp blocks, so that it can be signed by both parties.
23. As an administrator, I want the system to block any attempt to cancel or delete a posted service act that has linked payments (`Service Rollback Invariant`), so that financial audit trails cannot be corrupted.
24. As an administrator, I want to safely cancel a posted service act that has zero linked payments, so that erroneous documents can be voided, reversing counterparty debt and accounting ledger entries.

## Implementation Decisions

### 1. Database Schema & Architecture (`schema.prisma`)
The system introduces two dedicated Prisma models: `ServiceAct` and `ServiceActItem`:

```prisma
enum ServiceActType {
  PROVIDED // Ko'rsatilgan xizmat (biz ko'rsatdik)
  RECEIVED // Olingan xizmat (tashqaridan oldik)
}

enum ServiceActStatus {
  DRAFT
  POSTED
  CANCELLED
}

enum ServicePaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
}

model ServiceAct {
  id              String               @id @default(uuid())
  tenantId        String               @map("tenant_id")
  actNumber       String               @map("act_number")
  type            ServiceActType
  counterpartyId  String               @map("counterparty_id")
  status          ServiceActStatus     @default(DRAFT)
  paymentStatus   ServicePaymentStatus @default(UNPAID) @map("payment_status")
  actDate         DateTime             @default(now()) @map("act_date")
  currency        String               @default("UZS")
  exchangeRate    Decimal              @default(1.0) @db.Decimal(12, 4) @map("exchange_rate")
  externalNumber  String?              @map("external_number") // Vendor invoice/act #
  externalDate    DateTime?            @map("external_date")
  subtotal        Decimal              @default(0) @db.Decimal(15, 2)
  vatAmount       Decimal              @default(0) @db.Decimal(15, 2) @map("vat_amount")
  totalAmount     Decimal              @default(0) @db.Decimal(15, 2) @map("total_amount")
  paidAmount      Decimal              @default(0) @db.Decimal(15, 2) @map("paid_amount")
  notes           String?
  createdById     String?              @map("created_by_id")
  createdAt       DateTime             @default(now()) @map("created_at")
  updatedAt       DateTime             @updatedAt @map("updated_at")

  company         Company              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  counterparty    Counterparty         @relation(fields: [counterpartyId], references: [id], onDelete: Restrict)
  items           ServiceActItem[]

  @@unique([tenantId, actNumber])
  @@index([tenantId, type])
  @@index([tenantId, status])
  @@index([tenantId, counterpartyId])
  @@index([tenantId, actDate])
  @@map("service_acts")
}

model ServiceActItem {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  actId       String   @map("act_id")
  productId   String?  @map("product_id") // Optional link to catalog item (type=SERVICE)
  serviceName String   @map("service_name")
  description String?
  unit        String   @default("piece") // piece, hour, km, month, trip, sq_m, etc.
  quantity    Decimal  @default(1.0) @db.Decimal(12, 3)
  unitPrice   Decimal  @db.Decimal(15, 2) @map("unit_price")
  vatRate     Decimal  @default(0) @db.Decimal(5, 2) @map("vat_rate")
  vatAmount   Decimal  @default(0) @db.Decimal(15, 2) @map("vat_amount")
  lineTotal   Decimal  @db.Decimal(15, 2) @map("line_total")

  act         ServiceAct @relation(fields: [actId], references: [id], onDelete: Cascade)
  product     Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([tenantId, actId])
  @@map("service_act_items")
}
```

### 2. Modules and Interfaces
1. **Backend Module: `src/modules/services`**:
   - `services.controller.ts`: REST endpoints for CRUD, state transitions (`post`, `cancel`), and print data.
   - `services.service.ts`: Business logic, document numbering (`ACT-YYYY-XXXX`), line total computations, and database transactions.
   - DTOs: `CreateServiceActDto`, `UpdateServiceActDto`, `FilterServiceActsDto`.
2. **Finance Module Reconciliation Extension (`src/modules/finance/finance.service.ts`)**:
   - Extended `createIncome` and `createExpense`:
     When `sourceDocType === 'ServiceAct'` and `sourceDocId` is provided:
     - Atomically increments `ServiceAct.paidAmount` by `dto.amount`.
     - Recalibrates `paymentStatus`:
       - `paidAmount >= totalAmount` → `PAID`
       - `paidAmount > 0` → `PARTIALLY_PAID`
       - `paidAmount === 0` → `UNPAID`
     - Decrements counterparty debt (`debtBalance`) in direction-consistent terms.
3. **Accounting Double-Entry Postings (`src/modules/accounting/journal/journal.service.ts`)**:
   - Integrated into `postServiceAct`:
     - **PROVIDED**:
       - Debit 4010 (`Customer Receivables`): `totalAmount`
       - Credit 9030 (`Service Revenue`): `subtotal`
       - Credit 6410 (`VAT Output Payable`): `vatAmount` (if > 0)
     - **RECEIVED**:
       - Debit 9420/9430 (`Operating/Administrative Expenses`): `subtotal`
       - Debit 4410 (`Input VAT Asset`): `vatAmount` (if > 0)
       - Credit 6010 (`Supplier Payables`): `totalAmount`
4. **Frontend Architecture (`frontend/src/`)**:
   - Pages: `/services` with segmented views for "Ko'rsatilgan xizmatlar" and "Olingan xizmatlar".
   - Components: `ServiceActList`, `ServiceActDrawerForm`, `ServiceActDetailsModal`, `ServiceActPrintView`.
   - Action buttons: "Tasdiqlash" (Post), "Tahrirlash" (Edit, only when Draft), "Bekor qilish" (Cancel), "Moliya to'lovi" (Opens Finance modal pre-populated with counterparty and act ID).

### 3. API Contracts
- `POST /api/services`: Create draft service act.
- `GET /api/services`: Paginated search and filtering.
- `GET /api/services/:id`: Fetch act details with line items and linked finance transactions.
- `PUT /api/services/:id`: Update draft act.
- `POST /api/services/:id/post`: Confirm and post act (creates journal entries and accrues debt).
- `POST /api/services/:id/cancel`: Void/cancel posted act (verifies `Service Rollback Invariant`).
- `DELETE /api/services/:id`: Delete draft act.
- `GET /api/services/unpaid`: Endpoint returning open, unpaid acts for counterparty to populate Finance payment dropdowns.

### 4. Invariants and Guardrails
- **Service Rollback Invariant**: Cancelling or deleting an act is rejected with HTTP 400 if `paidAmount > 0` or linked `FinanceTransaction` records exist.
- **Immutability of Posted Documents**: Header and line items cannot be modified once `status === POSTED`.
- **Zero Cash Drawer Impact from Services**: The services service makes no direct mutations to `CashAccount`.

## Testing Decisions

### Seam Architecture
The primary testing seam is the **NestJS Service Layer (`ServicesService` + `FinanceService`)** using an isolated testing module against Prisma.

### Test Suites
1. **Document Lifecycle & Calculations (`services.service.spec.ts`)**:
   - Verify line item arithmetic: `lineTotal = (qty * unitPrice) + vatAmount`.
   - Verify document subtotal, vatAmount, and totalAmount aggregations.
   - Verify `DRAFT` creation does not alter `counterparty.debtBalance` or generate `JournalEntry`.
2. **Posting & Debt Accrual (`services.service.spec.ts`)**:
   - Verify posting `PROVIDED` increments customer `debtBalance` and creates Debit 4010 / Credit 9030 entries.
   - Verify posting `RECEIVED` decrements supplier `debtBalance` (increases company debt) and creates Debit 9420 / Credit 6010 entries.
3. **Finance Payment Reconciliation Seam (`finance.service.spec.ts`)**:
   - Record `FinanceTransaction` Income linked to `sourceDocType: 'ServiceAct'`: verify `paidAmount` increments and status updates to `PARTIALLY_PAID`.
   - Record full payment: verify status updates to `PAID`.
   - Record `FinanceTransaction` Expense against a `RECEIVED` service act: verify proper debt settlement.
4. **Service Rollback Guardrail (`services.service.spec.ts`)**:
   - Assert that attempting to cancel or delete an act with `paidAmount > 0` throws `BadRequestException` ("To'lov bog'langan aktni bekor qilib bo'lmaydi").

### Prior Art
- `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts` (Orthogonal status, finance settlement).
- `backend/src/modules/purchases/purchase-invariant.spec.ts` (Rollback guardrails, counterparty debt mutations).
- `backend/src/modules/finance/finance-settlement.spec.ts` (Invoice and expense payment allocations).

## Out of Scope
- Physical warehouse stock movement (handled by Inventory / Purchases / Sales modules).
- Inventory batch consumption and Landed Cost allocation (handled by `PurchaseExpense` and `AdditionalExpenseDocument`).
- Automatic tax portal synchronization (Didox / Soliq.uz e-imzo API integrations are deferred to subsequent integrations).

## Further Notes
- Currency formatting and options adhere strictly to ADR-0010 and the project's frontend conventions.
- All numbers use decimal arithmetic (`Decimal.js` in backend, proper formatting utilities in frontend) to avoid floating-point drift.
