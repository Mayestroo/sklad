# Specification: Moliya Bo‘limi (Finance Module) — 1C Mantiqi va Sodda Interfeys

## Problem Statement

Trading, distribution, and manufacturing enterprises in Uzbekistan face critical cash flow and counterparty settlement challenges:
1. **Conflated Counterparty Debt**: Counterparties were previously tracked using a single net scalar (`debtBalance = Receivables - Payables`). When an entity operates simultaneously as both a vendor (supplying raw materials) and a customer (buying finished products), netting their balances hides gross accounts receivable (debitorlik) and gross accounts payable (kreditorlik), creating reconciliation chaos and auditing blindspots.
2. **Disconnected Operational Payments**: Payments for sales were partially recorded in a legacy `payments` table (linked to sales orders or invoices), while general cash transactions were logged in `finance_transactions`. Purchasing expenses (`PurchaseReceipt`) were not natively integrated into the finance settlement engine, leaving supplier debt clearance manual or inconsistent.
3. **Missing Order Pre-Payment Integration**: Customer advance payments against unfulfilled Sales Orders (`SalesOrder`) did not natively route through the main Cashbook (`CashAccount`), failing to update the physical cash registers immediately while delaying order fulfillment gates (`Dispatch Gate`).
4. **Lack of Safe Cancellation (Storno) & Financial Invariants**: Operators lacked a formal 1C-style document reversal/cancellation mechanism. Deleting or voiding a financial transaction risked pushing cash registers into negative balances without leaving an immutable audit trail of who authorized and reversed the entry.
5. **No Unified Cash Flow & Liquidity Dashboard**: Business owners and financial controllers had to juggle three separate currency accounts (Dollar kassa in USD, Naqd kassa in UZS, and Bank Hisobraqam in UZS) without a consolidated cash dashboard displaying total liquid assets, today's/monthly inflows and outflows, net cash flow, and segregated upcoming receivables vs. payable liabilities.
6. **Accounting Jargon Friction**: Traditional accounting tools burden cashiers and warehouse managers with chart of accounts (5010, 5110, 4010, 6010, 9420) and double-entry postings, creating operator errors and slowing down daily trade operations.

---

## Solution

A full-stack, enterprise-grade **Moliya (Finance) Module** built strictly on **1C financial settlement logic** behind the scenes, while presenting a simple, human-friendly interface without accounting jargon:
1. **Three Core Cash Accounts (Kassalar)**:
   - **Dollar kassa**: Physical cash in USD.
   - **Naqd kassa**: Physical cash in UZS.
   - **Hisobraqam**: Commercial bank checking account in UZS.
2. **Segregated Counterparty Debt Architecture**:
   - `customerDebt` (Bizga to‘lanishi kerak bo‘lgan qarz / Debitorlik / Receivables).
   - `supplierDebt` (Bizning ta’minotchi oldidagi qarzimiz / Kreditorlik / Payables).
   - `netBalance` (Haqdorligimiz yoki Qarzdorligimiz ayirmasi).
   - Mijoz va ta’minotchi qarzlari o‘zboshimchalik bilan aralashtirilmaydi.
3. **Unified Financial Transactions (`FinanceTransaction`)**:
   - **Kirim (Income)**: Linked to `SalesInvoice`, `SalesOrder`, `ServiceAct` (provided), or free advance.
   - **Chiqim (Expense)**: Linked to `PurchaseReceipt`, `ServiceAct` (received), or categorized operating expense.
   - **O‘tkazma (Transfer & Exchange)**: Internal movements between cash accounts and bank accounts with real-time multi-currency conversion (USD ↔ UZS).
4. **Automated FIFO Settlement & Advance Recognition**:
   - If an operator links a specific document (e.g. `SalesInvoice` or `PurchaseReceipt`), that document's debt is cleared immediately.
   - If an operator records a payment with only a counterparty selected, the system clears their oldest open documents via FIFO and converts any surplus into an unallocated Advance (`Customer Advance` / `Supplier Advance`).
5. **Safe Cancellation (Storno) & Guardrails**:
   - Financial transactions cannot be silently deleted.
   - Reversal transitions the transaction to `CANCELLED`, restores cash balances and counterparty debts, strictly forbidding any action that would cause an unauthorized negative cash balance.
6. **Executive Dashboard & Real-Time Reporting**:
   - High-level dual-currency liquidity summary (consolidated UZS equivalent + exact USD and UZS breakdown).
   - Daily and monthly inflows, outflows, and net cash flow.
   - Segregated Debt overview (Kutilayotgan tushumlar vs To‘lanishi kerak bo‘lgan qarzlar).
   - Cash Flow statement, Account statement, and Counterparty reconciliation sheets (Akt sverka).

---

## User Stories

### Executive & Financial Management
1. As a business owner, I want a Finance Dashboard showing total liquid funds, so that I instantly know how much cash the business possesses across all accounts.
2. As a business owner, I want to view balances for Dollar kassa (USD), Naqd kassa (UZS), and Hisobraqam (UZS) side-by-side, so that I have complete transparency over cash vs. bank holdings.
3. As a financial director, I want to see Today's and This Month's Kirim (Inflow), Chiqim (Outflow), and Sof pul oqimi (Net Cash Flow), so that I can evaluate the enterprise's cash generation performance.
4. As a financial director, I want the dashboard to display total expected customer receivables ("Kutilayotgan tushumlar") and total supplier obligations ("To‘lanishi kerak bo‘lgan qarzlar") separately, so that I can forecast liquidity without conflating incoming and outgoing obligations.
5. As an executive, I want to see cash flows categorized clearly (Sales revenue, Debt collection, Goods purchase, Wages, Rent, Taxes, Logistics, Services), so that I understand where money originates and where it is spent without viewing 4-digit accounting codes.

### Inbound Cash & Sales Settlements (Kirim)
6. As a cashier, I want to click "Yangi kirim" and select date, kassa, amount, currency, counterparty, category, linked document, comment, and responsible employee, so that incoming funds are completely documented.
7. As a cashier, I want to select a customer and choose an open `SalesInvoice` from a dropdown showing remaining unpaid balances, so that the customer's payment immediately settles that specific invoice.
8. As a cashier, I want to enter a partial payment against a 100,000,000 UZS sales invoice (e.g. 60,000,000 UZS), so that the invoice automatically transitions to `PARTIALLY_PAID` with 40,000,000 UZS remaining debt.
9. As a cashier, I want the invoice to automatically transition to `PAID` when the total settled amount reaches 100% of the invoice sum, so that manual status toggling is eliminated.
10. As a sales cashier, I want to accept pre-payments against a confirmed `SalesOrder` (Zakaz), so that the money enters the cash register immediately, updates the order's `paidAmount`, and automatically unlocks the warehouse Dispatch Gate for shipping.
11. As a cashier receiving a general debt payment without a specific invoice number, I want the system to automatically apply the amount to the customer's oldest outstanding invoices using FIFO, so that past debts are systematically retired.
12. As a cashier, I want any excess payment exceeding the customer's open debt to be retained as an unallocated Customer Advance, applicable toward future sales orders or invoices.

### Outbound Cash & Purchasing Settlements (Chiqim)
13. As an accountant, I want to click "Yangi chiqim" and record disbursements with date, kassa, amount, currency, counterparty, category, linked document, comment, and responsible employee.
14. As an accountant paying for an inventory purchase, I want to select a supplier and link the payment to an open `PurchaseReceipt`, so that the company's payable debt to that supplier decreases immediately.
15. As an accountant, I want to record partial payments against purchase receipts, so that our outstanding payable balance to the supplier reflects the precise remaining sum.
16. As an accountant, I want to record operational disbursements that do not link to suppliers (e.g. staff salaries, office rent, transport, utility bills, state taxes), assigning them clear expense categories.
17. As an accountant settling a received service (e.g. logistics or warehouse lease from a `ServiceAct`), I want to link the expense to the service act, updating its `paidAmount` and `paymentStatus`.

### Internal Transfers & Multi-Currency Exchange (O‘tkazma)
18. As a cashier, I want to transfer money between cash accounts (e.g. from Hisobraqam to Naqd kassa 50,000,000 UZS), so that cash withdrawals are tracked without creating false income or expense.
19. As a cashier converting currency (e.g. Dollar kassa USD → Naqd kassa UZS), I want to specify the withdrawal amount in USD, the exchange rate, and the received amount in UZS, so that both accounts balance accurately and conversion notes are recorded.
20. As a cashier, I want the system to block any transfer if the source account has insufficient funds, so that registers cannot be overdrawn.

### Counterparty & Debt Management
21. As a credit controller, I want each counterparty profile to display two separate balances: `customerDebt` (our receivables from them) and `supplierDebt` (our payables to them), so that reciprocal trade relationships are transparent.
22. As a credit controller, I want to open a counterparty's financial statement (Akt sverka) showing a chronological timeline of all deliveries (goods/services) and all payments, with running debt balances.
23. As a credit controller, I want to filter the Counterparties directory by "Mijoz qarzdorligi" (Receivables > 0) and "Ta’minotchi qarzdorligi" (Payables > 0).

### Audit, Safe Cancellation & Invariants
24. As an auditor, I want every financial transaction to record the creator, timestamp, amount, cash account, counterparty, linked document, and last modifier, so that a complete audit trail exists.
25. As an auditor, I want direct destructive deletion of posted financial transactions to be prevented; instead, operations must be reversed via "Bekor qilish" (Storno / Cancel).
26. As an administrator cancelling an erroneous income transaction, I want the system to verify that the cash account has enough balance to reverse the funds before proceeding, so that phantom overdrafts are avoided.
27. As an administrator cancelling a payment linked to an invoice, I want the invoice's `paidAmount` to decrease and its status to revert from `PAID` to `PARTIALLY_PAID` or `UNPAID`.

### Reporting
28. As a financial analyst, I want a Cash Flow report filterable by date range, showing total inflows, total outflows, and net cash flow grouped by category.
29. As an analyst, I want an Account Statement report (Kassa daftari) showing opening balance, debit inflows, credit outflows, and closing balance for each cash register over any period.
30. As a sales director, I want a report ranking customers by outstanding debt aging, so that collection efforts can be prioritized.

---

## Implementation Decisions

### 1. Database Schema Extensions (`backend/prisma/schema.prisma`)
- **Segregated Counterparty Debts**:
  - Extend `model Counterparty`:
    - Add `customerDebt Decimal @default(0) @db.Decimal(15, 2) @map("customer_debt")` (Receivables / Debitorlik).
    - Add `supplierDebt Decimal @default(0) @db.Decimal(15, 2) @map("supplier_debt")` (Payables / Kreditorlik).
    - Keep `debtBalance` maintained as `customerDebt - supplierDebt` for backward compatibility.
- **Transaction Lifecycle & Audit**:
  - Extend `model FinanceTransaction`:
    - Add `status TransactionStatus @default(POSTED)` (`POSTED`, `CANCELLED`).
    - Add `responsibleUserId String? @map("responsible_user_id")` (Mas’ul xodim).
    - Add `cancelledById String? @map("cancelled_by_id")`.
    - Add `cancelledAt DateTime? @map("cancelled_at")`.
    - Add `cancellationReason String? @map("cancellation_reason")`.
    - Ensure `sourceDocType` formally supports: `'SalesInvoice'`, `'SalesOrder'`, `'PurchaseReceipt'`, `'ServiceAct'`, or `null`.
- **System Transaction Categories**:
  - Seed default system categories for `TransactionType`:
    - **INCOME**: Sotuvdan tushum (Sales), Qarzdorlik to‘lovi (Debt recovery), Ta’minotchi qaytargan pul (Supplier refund), Boshqa daromad (Other income).
    - **EXPENSE**: Tovar xaridi (Goods purchase), Xomashyo xaridi (Raw materials), Ish haqi (Payroll), Ijara (Rent), Transport/Logistika (Logistics), Soliqlar (Taxes), Xizmatlar (Services), Boshqa xarajat (Other expenses).

### 2. Backend Financial Engine (`FinanceService`)
- **Income Workflow (`createIncome`)**:
  1. Increment target `CashAccount.balance`.
  2. If `counterpartyId` provided, decrement `Counterparty.customerDebt`.
  3. If `sourceDocType === 'SalesInvoice'`: atomically increment invoice `paidAmount` and update `paymentStatus` (`UNPAID` → `PARTIALLY_PAID` → `PAID`).
  4. If `sourceDocType === 'SalesOrder'`: atomically increment order `paidAmount`. If `paidAmount` satisfies the order's `PaymentCondition` (`PREPAID_100` or `PARTIAL`), trigger dispatch gate readiness.
  5. If `sourceDocType === 'ServiceAct'`: update service act `paidAmount` and `paymentStatus`.
  6. If no document is selected: run FIFO settlement on the customer's open sales invoices.
- **Expense Workflow (`createExpense`)**:
  1. Validate source `CashAccount.balance >= amount`.
  2. Decrement source `CashAccount.balance`.
  3. If `counterpartyId` provided, decrement `Counterparty.supplierDebt`.
  4. If `sourceDocType === 'PurchaseReceipt'`: atomically increment receipt `paidAmount` and update `paymentStatus` (`UNPAID` → `PARTIALLY_PAID` → `PAID`).
  5. If `sourceDocType === 'ServiceAct'`: update service act `paidAmount` and `paymentStatus`.
  6. If no document is selected: run FIFO settlement on the supplier's open purchase receipts.
- **Transfer & Conversion Workflow (`createTransfer`)**:
  1. Verify distinct accounts and sufficient source balance.
  2. Multi-currency support: compute target amount based on explicit exchange rate.
  3. Atomically decrement source account and increment destination account.
- **Storno & Cancellation Workflow (`cancelTransaction`)**:
  1. Verify transaction is currently `POSTED`.
  2. If Income cancellation: verify account balance >= amount; decrement account balance; restore counterparty customer debt; revert linked invoice/order `paidAmount` and `paymentStatus`.
  3. If Expense cancellation: increment account balance; restore counterparty supplier debt; revert linked receipt `paidAmount` and `paymentStatus`.
  4. If Transfer cancellation: decrement destination account and increment source account.
  5. Mark transaction status as `CANCELLED` with audit metadata.

### 3. Frontend Experience & Navigation
- **Redesigned Finance Hub (`frontend/src/app/[locale]/(dashboard)/finance/page.tsx`)**:
  - **Tab 1: Dashboard**:
    - Dual liquidity card (Total liquid assets in UZS equivalent; breakdown for Dollar kassa, Naqd kassa, and Hisobraqam).
    - Today's and This Month's Income, Expense, Net Cash Flow.
    - Quick indicators for Total Receivables (Debitorlik) and Total Payables (Kreditorlik).
    - Quick Action buttons: `+ Kirim`, `- Chiqim`, `⇆ O‘tkazma / Konvertatsiya`.
  - **Tab 2: Kirim (Income)**: Dedicated view with quick creation drawer, document search, and counterparty selector.
  - **Tab 3: Chiqim (Expense)**: Dedicated view with purchase receipt linking and expense categorization.
  - **Tab 4: O‘tkazmalar (Transfers)**: Log of inter-account transfers and currency conversions.
  - **Tab 5: Operatsiyalar tarixi (Journal)**: Comprehensive filterable table (Date, Type, Cash account, Counterparty, Amount, Category, Linked Document, Status, Actions: Edit note, Cancel/Storno).
  - **Tab 6: Qarzdorlik (Debts)**: Segregated tabs for "Bizga to‘lanishi kerak" (Customer Receivables) and "Biz to‘lashimiz kerak" (Supplier Payables).
  - **Tab 7: Hisobotlar (Reports)**:
    - Cash Flow statement (Pul oqimi).
    - Cash register turnover (Kassa harakati).
    - Counterparty reconciliation statement (Akt sverka).

---

## Testing Decisions

### What Makes a Good Test
- **Behavioral & Invariant Verification**: Tests must verify observable financial states (cash account balances, counterparty debts, document payment statuses, audit logs) rather than private internal implementation methods.
- **Strict Isolation**: Transactions must be isolated; rollbacks must leave the database in its exact pre-test state.

### Modules to be Tested
1. `FinanceService` (`backend/src/modules/finance/finance.service.ts`):
   - Income creation with direct `SalesInvoice` settlement.
   - Income creation with `SalesOrder` pre-payment and Dispatch Gate triggering.
   - Income FIFO auto-allocation across multiple invoices.
   - Expense creation with direct `PurchaseReceipt` settlement.
   - Expense FIFO auto-allocation across multiple receipts.
   - Inter-account transfer and currency exchange calculation.
   - Transaction cancellation (Storno) and balance/debt reversion.
   - Negative cash balance prevention invariant.
2. `FinanceController` (`backend/src/modules/finance/finance.controller.ts`):
   - HTTP endpoints validation and permissions.
3. `PurchasesService` & `SalesInvoicesService`:
   - Verification that posting purchase receipts and sales invoices increments `supplierDebt` and `customerDebt` independently.

### Prior Art
- Existing test suites:
  - `backend/src/modules/finance/finance-settlement.spec.ts`
  - `backend/src/modules/purchases/purchases.service.unit.spec.ts`
  - `backend/src/modules/purchases/purchase-invariant.spec.ts`
  - `backend/src/modules/sales/invoices/sales-invoices.service.spec.ts`

---

## Out of Scope

- Direct programmatic integration with Uzbekistan commercial banks via direct Open Banking APIs (Bank-Mijoz manual 1C file import may be scheduled in a subsequent release).
- Automatic fiscal receipt generation via virtual online cash registers (Soliq / OFD virtual kassa integratsiyasi — handled as an external POS hardware integration).
- Complex barter/tripartite mutual settlement agreements (Uchtomonlama vzaimozachet dalolatnomalari).

---

## Further Notes

- **Accounting Decoupling**: In accordance with user requirements, the user interface remains completely free of accounting account numbers (5010, 5110, 4010, 6010, etc.). All necessary double-entry ledger postings (`JournalEntry`) continue to be generated automatically behind the scenes for formal accounting and tax compliance.
- **Currency Display**: Adheres strictly to the frontend convention defined in `CONTEXT.md`: `formatCurrency(amount, locale, currency)` is used without redundant currency code suffixes.
