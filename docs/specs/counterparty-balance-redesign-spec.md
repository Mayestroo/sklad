# Specification: Counterparty Debt & Balance Management Redesign (Kontragentlar Moduli: Haqdorlik va Qarzdorlik Boshqaruvi hamda Debitor/Kreditor Balans Redizayni) v2.0

## Problem Statement

In enterprise commerce and distribution operations, managing cash flow requires real-time visibility into who owes money to the enterprise (Accounts Receivable / Debitorlik) and who the enterprise owes money to (Accounts Payable / Kreditorlik). Under legacy counterparty interfaces:
1. **Ambiguous Single-Debt Metric (Umumlashgan qarz chalkashligi)**: The interface featured a single generic "Qarzdorlar" card that lumped debtors and creditors into one unsigned total. Business owners and accountants could not determine at a glance whether the company was net-positive in receivables or burdened by impending supplier payables.
2. **Accounting Inversion & Formula Contradictions (Hisob-kitob formulalaridagi noaniqlik)**: Without strict sign and color conventions, staff frequently confused customer debt (an enterprise asset to be collected) with supplier debt (a legal liability to be settled). Inverted formulas also risked labeling indebted customers with negative numbers or misinterpreting supplier liabilities.
3. **Hybrid Partner Blindspot (type: 'BOTH' bo'lgan kontragentlar nazoratsizligi)**: Counterparties acting as both supplier and buyer (e.g. barter partners or distributors who also provide raw materials) had their accounts obscured. Arbitrary netting concealed actual legal obligations, making reconciliation audits difficult.
4. **Advance Prepayments Hidden (Mijoz avansi va ortiqcha to'lovlar)**: When customers paid advances or made overpayments before goods were invoiced, their accounts showed negative numbers that either disappeared from debtor filters or were improperly treated as supplier debts.
5. **Slow Operational Settlement (Qarzni darhol so'ndirish imkoniyati yo'qligi)**: Operators identifying overdue counterparties had to navigate out of the counterparties directory, open the finance module, search for the partner, and manually create payment entries. There was no direct in-grid 1-click settlement or instant reconciliation statement (Akt sverka) drawer.

## Solution

A production-grade, full-stack **Counterparty Debt & Balance Management Redesign (Kontragentlar: Haqdorlik va Qarzdorlik Boshqaruvi)** that separates receivables from payables, standardizes visual accounting indicators, delivers high-performance aggregation APIs, and enables rapid in-grid debt settlement:

1. **Four Dynamic Top KPI Summary Widgets**:
   - **Mijozlar (Total Customers)**: Total count of active clients (`CUSTOMER` and `BOTH`).
   - **Yetkazib beruvchilar (Total Suppliers)**: Total count of active vendors (`SUPPLIER` and `BOTH`).
   - **Bizga qarzdorlar / Haqdorlik (Receivables / Debitorlar)**: Count of indebted counterparties and total outstanding receivables displayed in bold emerald green with explicit `+` prefix (e.g. `3 kishi | +12,500,000 UZS`).
   - **Bizning qarzimiz / Qarzdorlik (Payables / Kreditorlar)**: Count of creditors owed and total enterprise liability displayed in bold crimson red with explicit `-` prefix (e.g. `2 kishi | -4,779,040 UZS`).
2. **Four Dedicated Quick-Filter Balance Tabs**:
   - **Barcha kontragentlar (All Counterparties)**: Full directory listing.
   - **Faqat bizga qarzdorlar (Receivables Only)**: Instant single-click filter displaying all counterparties where `NetBalance > 0` (or `customerDebt > 0`).
   - **Faqat bizning qarzimiz (Payables Only)**: Instant single-click filter displaying all counterparties where `NetBalance < 0` (or `supplierDebt > 0`).
   - **Hisob-kitob qilinganlar (Settled / Zero Balance)**: Counterparties with zero outstanding debt balance (`NetBalance = 0`).
3. **Data Grid Visual Balance Column (`QARZ BALANSI`)**:
   - **Positive Balance (`+ Summa`, Green `#10b981`)**: Denotes customer indebtedness to the enterprise (Debitor / Haqdorlik).
   - **Negative Balance (`- Summa`, Red `#ef4444`)**: Denotes enterprise liability to the supplier (Kreditor / Majburiyat).
   - **Zero Balance (`0 UZS`, Neutral Slate)**: Denotes fully settled accounts.
   - **Customer Advance Badge**: Counterparties with negative customer debt (unearned revenue / advance received) display a distinct indicator separating prepayments from trade payables.
4. **Backend Dynamic Aggregation API (`GET /api/v1/contacts/summary`)**:
   - Dual-mounted controller routing (`/api/v1/contacts/summary` and `/api/sales/counterparties/summary`) providing tenant-isolated counts and sums for customers, suppliers, receivables, and payables.
   - Query filter parameter `balanceFilter` (`all`, `receivables`, `payables`, `settled`) optimized with database index support and Prisma query conditions.
5. **1-Click In-Grid Payment Settlement & Reconciliation Statement (Akt sverka)**:
   - In-grid quick action button: Opens payment modal pre-filled with the counterparty name, transaction direction (Income for debtors, Expense for creditors), and recommended settlement amount.
   - Clickable balance drilldown: Clicking the balance amount launches a reconciliation statement drawer (`AktSverkaDrawer`) itemizing recent sales invoices, purchase receipts, finance payments, and returns.

## User Stories

1. As a business owner, I want to open the Counterparties module and see four distinct summary cards at the top of the page, so that I can immediately assess the company's financial balance position.
2. As a business owner, I want to see the total number of customers and suppliers clearly segregated, so that I understand our partner ecosystem size.
3. As a chief financial officer, I want to see "Bizga qarzdorlar" with total counterparty count and total amount in emerald green with a `+` prefix, so that I immediately know our expected cash inflows from sales.
4. As a chief financial officer, I want to see "Bizning qarzimiz" with total vendor count and total amount in crimson red with a `-` prefix, so that I immediately know our outstanding debt obligations to suppliers.
5. As a finance manager, I want the summary cards to update in real time whenever sales invoices, purchase receipts, or payments are posted, so that KPI metrics always reflect current ledger truth.
6. As a credit controller, I want a tab bar with four quick filter buttons: "Barcha kontragentlar", "Faqat bizga qarzdorlar", "Faqat bizning qarzimiz", and "Hisob-kitob qilinganlar".
7. As a credit controller, I want each filter tab to show a badge with the number of counterparties matching that filter, so that I know how many records exist before clicking.
8. As an operator collecting debt, I want to click "Faqat bizga qarzdorlar" to isolate debtors with a single click, so that my collection calls are focused and efficient.
9. As an accounts payable specialist, I want to click "Faqat bizning qarzimiz" to view all vendors we owe money to, so that I can prepare upcoming disbursement schedules.
10. As an accountant closing a fiscal period, I want to click "Hisob-kitob qilinganlar (Balans = 0)" to verify accounts with zero open balance, so that I can reconcile settled contracts.
11. As a sales rep browsing the table, I want the "QARZ BALANSI" column to format positive balances in green with a `+` sign, so that I instantly recognize customers with open receivables.
12. As a procurement manager browsing the table, I want the "QARZ BALANSI" column to format negative balances in red with a `-` sign, so that I immediately identify suppliers waiting for payment.
13. As an operator, I want counterparties with zero balance to display "0 UZS" in neutral gray without signs, so that they do not distract from active debtor/creditor accounts.
14. As an accountant, I want counterparties of type `BOTH` (acting as both customer and supplier) to display their true net settlement position in the grid while preserving segregated gross balances in their detailed profile.
15. As an auditor, I want KPI summary aggregation to report gross receivables and gross payables separately for `BOTH` counterparties, preventing unauthorized implicit offsetting before legal reconciliation.
16. As a cashier, I want customer prepayments (advances) to be highlighted with a dedicated "Avans olindi" badge, so that I do not mistake customer credit for a vendor liability.
17. As an operator reviewing a debtor row, I want a 1-click "To'lov qabul qilish" button in the action column, so that I can open the cash receipt modal with the customer and debt amount pre-filled.
18. As an operator reviewing a creditor row, I want a 1-click "To'lov qilish" button in the action column, so that I can open the cash disbursement modal with the vendor and payable amount pre-filled.
19. As an accountant, I want clicking on a counterparty's balance amount to open an "Akt sverka" reconciliation drawer, displaying chronologically sorted invoices, payments, and running balance.
20. As an accountant, I want to export or print the "Akt sverka" statement directly from the drawer, so that I can share signed reconciliation documents with the counterparty.
21. As a developer integrating third-party systems, I want `GET /api/v1/contacts/summary` to return `total_customers`, `total_suppliers`, `receivables` (count and total_amount), and `payables` (count and total_amount) in JSON format.
22. As a frontend client, I want `GET /api/sales/counterparties/summary` to be available as an alias for backward compatibility across all internal ERP pages.
23. As a frontend developer, I want `GET /api/sales/counterparties?balanceFilter=receivables` to filter counterparties at the database query level, ensuring high performance even with thousands of records.
24. As a frontend developer, I want `GET /api/sales/counterparties?balanceFilter=payables` to return only counterparties with outstanding payable balances.
25. As a frontend developer, I want `GET /api/sales/counterparties?balanceFilter=settled` to return only counterparties whose debt balance is exactly zero.
26. As an operator searching by text, I want the search input to work seamlessly in combination with active balance filter tabs, so that I can find a specific debtor by name, INN, or phone number.
27. As an operator filtering by folder, I want folder selection to work simultaneously with balance filters, allowing me to view "VIP Clients who owe us money".
28. As a multi-currency operator, I want foreign currency debts (e.g. USD contracts) to be aggregated into the base currency (UZS) using Central Bank exchange rates for overall summary totals.
29. As a multi-currency operator, I want counterparty rows with foreign currency balances to display their primary currency alongside the base currency equivalent.
30. As a system administrator, I want safety invariants preventing the deletion of any counterparty that has a non-zero balance (`debtBalance != 0` or open receivables/payables), protecting ledger integrity.

## Implementation Decisions

### 1. Mathematical Balance & Sign Conventions
- **Customer Receivables Formula**: `CustomerDebt = Total_Sales_Invoiced - Total_Payments_Received`. When positive, represents an enterprise asset (`+`, Green `#10b981`).
- **Supplier Payables Formula**: `SupplierDebt = Total_Purchases_Invoiced - Total_Payments_Made`. When positive, represents an enterprise liability (`-`, Red `#ef4444`).
- **Counterparty Net Settlement Position**: `NetBalance = CustomerDebt - SupplierDebt`.
  - `NetBalance > 0`: Debitor / Haqdorligimiz — displayed as `+ {formatCurrency(netBalance)}` in green.
  - `NetBalance < 0`: Kreditor / Qarzdorligimiz — displayed as `- {formatCurrency(Math.abs(netBalance))}` in red.
  - `NetBalance == 0`: Hisob-kitob qilingan — displayed as `{formatCurrency(0)}` in neutral text.

### 2. Gross Aggregation in KPI Summary vs Net Representation in Grid
- In `getSummary`, receivables and payables are aggregated in **gross terms** across counterparties:
  - Any entity with `customerDebt > 0` increments `receivables.count` and adds to `receivables.total_amount`.
  - Any entity with `supplierDebt > 0` increments `payables.count` and adds to `payables.total_amount`.
  - For hybrid entities (`type: 'BOTH'`), both sides of the balance sheet are tracked to prevent unjournaled netting.
- In the data grid (`findAll`), each row displays `netBalance` to give the operator an immediate single-figure operational balance.

### 3. API Routing and Contracts
- Controller routes are mounted on both `@Controller(['api/sales/counterparties', 'api/v1/contacts'])` for seamless backward compatibility.
- Endpoint `GET /summary` returns:
  ```json
  {
    "total_customers": 3,
    "total_suppliers": 2,
    "receivables": { "count": 1, "total_amount": 12500000.00 },
    "payables": { "count": 2, "total_amount": 4779040.00 }
  }
  ```
- Endpoint `GET /` accepts query parameter `balanceFilter`:
  - `all`: No balance restriction.
  - `receivables`: Returns records where `customerDebt > 0` or (`type != SUPPLIER` and `debtBalance > 0`).
  - `payables`: Returns records where `supplierDebt > 0` or (`type == SUPPLIER` and `debtBalance > 0`) or negative customer balances.
  - `settled`: Returns records where net debt is zero.

### 4. Advance Payments (Mijoz avansi) Separation
- When `customerDebt < 0` (customer paid more than invoiced), the counterparty row maintains a visual tag `Avans olindi` (Prepayment Received) rather than disguising the customer as a trade vendor.
- In financial aggregation, customer advances are categorized under deferred revenue / liabilities according to national accounting standards.

### 5. In-Grid 1-Click Settlement and Reconciliation Statement
- Table rows feature a contextual payment action:
  - For debtors: Green action icon launching `RecordPaymentModal` with `type: INCOME` and counterparty pre-selected.
  - For creditors: Red action icon launching `RecordPaymentModal` with `type: EXPENSE` and counterparty pre-selected.
- The balance amount in the `QARZ BALANSI` column is rendered as an interactive element; clicking it opens the `AktSverkaDrawer` fetching the statement of account for that counterparty.

## Testing Decisions

### 1. Characteristics of Good Tests
- Tests verify observable business behavior (API response contracts, aggregate calculations, filter results, invariant protections), never private implementation details.
- Arithmetic invariants must be rigorously verified: positive balances must produce debitor metrics; negative balances must produce creditor metrics; zero balances must verify settled state.

### 2. Tested Modules
- **Backend Service & Controller (`counterparties.service.ts` & `counterparties.controller.ts`)**:
  - `getSummary`: Validates counts and sums for customers, suppliers, receivables, and payables across diverse debt states.
  - `findAll(balanceFilter)`: Validates that `all`, `receivables`, `payables`, and `settled` queries return exact matching subsets.
  - `delete`: Validates rejection if counterparty has active debts or open transactions.
- **Frontend Page & Components (`counterparties/page.tsx`)**:
  - Validates correct rendering of 4 KPI cards with positive/negative color codes.
  - Validates active state and counter badge display on 4 balance filter tabs.
  - Validates `QARZ BALANSI` rendering with `+` green and `-` red prefixes.

### 3. Prior Art in Codebase
- `backend/src/modules/sales/counterparties/counterparties.service.spec.ts`: Existing test harness for counterparty operations and summary.
- `backend/src/modules/finance/finance-settlement.spec.ts`: Test patterns for customer/supplier debt adjustments and payment linking.
- `backend/src/modules/opening-balances/opening-balances.service.spec.ts`: Invariant tests ensuring counterparty debt tracking consistency.

## Out of Scope

1. **Automatic Debt Factoring / Third-Party Assignment**: Transferring debt obligations to third-party collection agencies or financial factoring firms.
2. **Legal Litigation & Court Order Tracking**: Tracking court dates, litigation cases, or judicial freeze orders against debtor counterparties.
3. **Automated SMS/Email Debt Dunning**: Scheduled automatic dispatch of SMS payment reminders or legal notices to debtors (handled in a separate notification module).
4. **General Ledger Provodka Modification**: Altering double-entry journal postings (NAS accounts 4010/6010) created by sales invoices or purchase receipts.

## Further Notes

- All currency amounts must use the central `formatCurrency(amount, locale)` utility, which appends the currency code once without duplicate labels.
- The color palette strictly adheres to Sklad ERP tokens: Emerald Green (`#10b981` / `#059669`) for assets and receivables, Crimson Red (`#ef4444` / `#dc2626`) for obligations and payables, and Slate Gray for neutral settled accounts.
