# Implementation Plan — Dashboard & Finance (Cash Flow) Modules

*Derived from Technical Specifications TZ-01 (Dashboard) and TZ-02 (Finance — Cash Flow Management)*
Version 1.0

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Module A — Dashboard (Home Page)](#2-module-a--dashboard-home-page)
3. [Module B — Finance: Cash Flow Management](#3-module-b--finance-cash-flow-management)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Acceptance Checklist](#5-acceptance-checklist)

---

## 1. Purpose & Scope

This document translates two technical specifications (TZ-01 — Dashboard, TZ-02 — Finance / Cash Flow Management) into a single, developer-ready implementation plan. It defines scope, data model, API contracts, business rules, role-based access, and a phased delivery roadmap (MVP → Phase 2) for both modules, which are tightly coupled: Finance is the source of truth for real cash movement, and Dashboard is a read-only aggregation layer built on top of Finance and other modules.

Both modules belong to a broader ERP-style system that also includes Purchasing, Warehouse, Sales, Counterparties/Debt, and Profit & Loss reporting. This plan focuses on Dashboard and Finance but calls out every integration point with the surrounding modules so backend contracts can be defined without ambiguity.

### 1.1 System / Module Dependency Chain

The system follows one core data flow. Every number shown on the Dashboard is derived automatically from operations recorded upstream — nothing is entered manually on the Dashboard itself.

> **Purchasing → Warehouse → Sales → Finance → Debt → Profit → Dashboard**

> Example: when a sale is recorded, the system must automatically recompute the sale amount, warehouse stock, receivables (if sold on credit), and profit — all without manual intervention on the Dashboard.

### 1.2 Guiding Principles

- Dashboard is read-only: it never creates or edits data, it only aggregates it.
- Finance is the single source of truth for actual cash in/out movement (distinct from Sales/Purchase document amounts).
- Every currency (UZS, USD, …) is tracked and displayed separately — amounts in different currencies are never summed together.
- Inter-account transfers are never treated as income or expense in cash-flow totals.
- All financial data is filtered by user role — a user without permission for a given financial figure must not see it anywhere, including on the Dashboard.

---

## 2. Module A — Dashboard (Home Page)

### 2.1 Objective

The Dashboard is the landing page after login. It gives the user a single-screen view of the company's current financial and operational state, and must answer the following business questions at a glance:

- How much cash does the company currently have?
- How much cash came in during the selected period?
- How much cash went out?
- How much was sold?
- What is the profit?
- How much do customers owe the company (receivables)?
- How much does the company owe others (payables)?
- How much stock is in the warehouse?
- Is the financial position improving or worsening vs. the previous period?

### 2.2 Page Structure

The Dashboard is composed of the following blocks, top to bottom:

- Period selector
- Core KPI row: Cash, Sales, Expenses, Profit
- Receivables (amounts owed to the company)
- Payables (amounts the company owes)
- Cash flow chart (Income vs. Expense)
- Bank & Cash balances
- Sales dynamics chart
- Alerts
- Recent transactions

### 2.3 Period Selector

Available presets: Today, Yesterday, This week, Last week, This month, Last month, This quarter, This year, and a Custom range. Changing the period must automatically refresh every dependent widget on the page.

### 2.4 Core KPI Blocks

#### 2.4.1 💰 Cash

Current total cash balance across all company accounts.

> **Formula:** Cash = Bank balance + Cash-on-hand balance, calculated separately per currency (e.g. UZS 185,400,000 and USD 12,500 shown independently — never summed).

#### 2.4.2 📈 Sales

Total sales amount for the selected period. Includes cash sales, bank-paid sales, and credit sales — a sale made on credit still counts as a sale even though cash has not yet been received.

#### 2.4.3 💸 Expenses

Total cash that left the company during the selected period, covering categories such as:

- Supplier payments
- Taxes
- Payroll
- Rent
- Transport
- Advertising
- Other expenses

#### 2.4.4 📊 Profit

> **Gross Profit** = Sales − Cost of Goods Sold
> **Net Profit** = Gross Profit − Operating Expenses

The Dashboard displays Net Profit as the headline figure. The detailed profit-calculation engine is implemented in the Reports / P&L module; Dashboard only consumes its output.

### 2.5 Receivables (👤 Debitor Debt)

Shows total amounts customers owe the company:

- Total receivable amount
- Number of debtor counterparties
- Number of overdue debts
- Top debtors

Clicking this block navigates to Counterparties → Receivables.

### 2.6 Payables (🏢 Kreditor Debt)

Shows total amounts the company owes to suppliers and other counterparties:

- Total payable amount
- Number of counterparties
- Number of overdue payables
- Top creditors

### 2.7 Cash Flow Chart

Displays Income and Expense as two separate series for the selected period, with granularity toggles:

- Daily
- Weekly
- Monthly

### 2.8 Bank & Cash

**2.8.1 Bank** — Shows all company bank accounts and their balances. If there are multiple accounts, each is listed individually.

**2.8.2 Cash on hand** — Total Cash = Bank + Cash on hand.

### 2.9 Sales Dynamics

A chart of sales over the selected period, switchable between Day / Week / Month granularity.

### 2.10 Alerts

The Dashboard automatically surfaces operational warnings such as:

- Overdue customer debt
- Payables approaching their due date
- Stock below minimum threshold
- Cash-on-hand balance below a configured limit
- Other critical financial warnings

### 2.11 Recent Transactions

A short feed of the most recent financial operations, with columns: Date, Counterparty, Operation type, Income, Expense, Currency. A "View all" action navigates to Finance → Transactions.

### 2.12 Roles & Access

| Role | Visible data |
|---|---|
| Director | Full access: cash, sales, expenses, profit, receivables/payables, warehouse |
| Manager | Sales, customers, and goods only |
| Warehouse keeper | Goods, warehouse stock, and stock in/out |
| Accountant | Finance, bank, cash, debt, and reports |

> Financial data the user is not authorized to see must not appear anywhere on the Dashboard — not as a total, not inside a chart, not inside an alert.

### 2.13 Core Business Rule

The Dashboard never originates data. Every figure is computed automatically from operations recorded in other modules (Purchasing → Warehouse → Sales → Finance → Debt → Profit). There is no manual override or manual entry of Dashboard numbers.

### 2.14 Technical Requirements

**2.14.1 Frontend** — Responsive across Desktop, Tablet, and Mobile.

**2.14.2 Backend API**

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard` | Aggregated payload for the full Dashboard page |
| `GET /api/dashboard/finance` | Cash / income / expense / profit KPIs |
| `GET /api/dashboard/sales` | Sales KPI and sales dynamics data |
| `GET /api/dashboard/debts` | Receivables & payables summary |
| `GET /api/dashboard/cash-flow` | Cash flow chart series (in / out) |
| `GET /api/dashboard/alerts` | Active alert list |

**2.14.3 Common query filters**

- `date_from`
- `date_to`
- `organization_id`
- `warehouse_id`
- `currency`

### 2.15 Scope: MVP vs. Phase 2

**2.15.1 MVP (mandatory in v1)**

- Period filter
- Total cash
- Income
- Expenses
- Sales
- Profit
- Receivables
- Payables
- Bank balances
- Cash-on-hand balance
- Cash flow chart
- Recent transactions

**2.15.2 Phase 2**

- Automated alerts
- Top debtors list
- Sales dynamics chart
- Minimum-stock warnings
- Multi-currency analytics

---

## 3. Module B — Finance: Cash Flow Management

### 3.1 Objective

The Finance module controls the company's real cash movement: where money came from, where it went, why it moved, which account holds it, and what the current balance is. It is designed as a simplified, business-friendly version of a 1C-style bank/cash operations journal.

### 3.2 Core Business Questions

- Where did the money come from?
- Where did the money go?
- Why did it come in or go out?
- Which account did it move from/to?
- Who is it related to?
- How much cash is currently available?
- What are total income and expense for the selected period?
- What is the debt balance per counterparty?

### 3.3 Core Cash Accounts

| Account | Description |
|---|---|
| 💵 USD cash | Cash held in US dollars |
| 💰 UZS cash | Cash held in Uzbek som |
| 🏦 Bank account | Company funds held at the bank |

> UZS and USD balances are tracked independently; different currencies are never simply added together.

### 3.4 Primary Interface — Cash Flow Journal

The main Finance screen is a tabular Cash Flow journal. It is based on the existing 1C journal, but strips excess technical columns from the primary view:

- Date
- Account
- Counterparty
- Operation type
- Income
- Expense
- Currency

Document number, internal ID, organization, and other technical fields are kept on the transaction detail card, not the list view.

### 3.5 Core Actions

- ➕ Add income
- ➖ Add expense
- 🔄 Inter-account transfer
- ✏️ Edit
- 🗑️ Delete (restricted to authorized users only)
- 🔎 Search & filter

### 3.6 Cash Income

Income is money that has actually landed in a company account. Typical income types:

- Payment from customer
- Refund from a counterparty
- Loan proceeds
- Founder / owner contribution
- Other income

**Income record fields:** Date & time, Amount, Currency, Destination account, Counterparty, Income type, Comment, Linked document/sale/debt operation (if applicable).

### 3.7 Cash Expense

Expense is money actually spent from a company account. Typical expense types:

- Payment for goods
- Supplier payment
- Taxes
- Payroll
- Rent
- Transport
- Advertising
- Bank fees
- Loan repayment
- Other expense

### 3.8 Inter-Account Transfer

Moving money from one account to another is neither income nor expense — it is only a change in where cash is held.

- Bank account → Cash on hand: bank decreases, cash on hand increases
- Cash on hand → Bank account: cash on hand decreases, bank increases
- USD cash → USD bank account: USD cash decreases, bank balance increases

> An inter-account transfer must never be double-counted as income/expense in Cash Flow totals.

### 3.9 Counterparty & Debt Relationship

Every income or expense record may be linked to a counterparty. Cash movement and the change in debt are calculated separately from one another.

- **Amount owed to us** — what a counterparty owes the company
- **Amount we owe** — what the company owes a counterparty

> Example: Counterparty A owes the company 100M. They pay 30M → income +30M → remaining debt 70M.

> Example: The company owes Counterparty B 100M. B returns 20M to us → income +20M → our remaining debt 80M. We later pay 50M → expense −50M → remaining debt 30M.

### 3.10 Relationship with Sales, Cost, and Profit

Finance calculates real cash flow, but integrates with Sales, Warehouse, Purchasing, Cost, and Debt modules:

- **Sale price** — the amount a good was sold to the customer for
- **Cost** — what the sold good cost the company
- **Gross profit** = Sale amount − Cost of goods sold
- **Cash income** — the amount actually paid by the customer
- **Receivable** — the sold-but-not-yet-collected amount

> Example: goods worth 100M are sold at a cost of 70M → gross profit 30M. If the customer has not paid, cash income = 0 and receivable = 100M. Once the customer pays 40M, cash income becomes +40M and receivable drops to 60M.

### 3.11 Transactions Journal

**List columns:** Date, Account, Counterparty, Operation type, Income, Expense, Currency.

**Additional detail-card fields:** Document number, Comment, Linked sale/purchase/debt operation, Created-by user, Creation date, Edit history.

### 3.12 Filters & Search

- Date range
- Account
- Income / Expense
- Currency
- Counterparty
- Operation type
- Amount range

### 3.13 Cash Flow Metrics

- Opening balance
- Total income
- Total expense
- Net cash flow = Income − Expense
- Closing balance

> Inter-account transfers must not artificially inflate or deflate net cash flow.

### 3.14 Balance by Account

| Account | Tracked balance |
|---|---|
| 💵 USD cash | USD balance |
| 💰 UZS cash | UZS balance |
| 🏦 Bank account | UZS balance |

### 3.15 Dashboard Integration

Finance feeds the Dashboard with:

- Total cash balance
- Income
- Expense
- Net cash flow
- Balance by account
- Primary cash movement for the selected period

### 3.16 Integration with Other Modules

- Purchasing → Goods receipt → Cost/Warehouse → Payable to supplier → Payment → Finance
- Sales → Goods issue → Sale price → Cost → Profit → Customer debt/payment → Finance
- Finance → Dashboard → Cash flow and balances

### 3.17 Audit & Security

- Creator of every record is stored
- Edit history is retained
- Delete permission is restricted
- Editing a linked transaction triggers a warning
- Financial data is shown based on role permissions

### 3.18 Roles & Access

| Role | Access |
|---|---|
| Director | All financial data and all permitted actions |
| Accountant | Income, expense, transfer, debt, and reports |
| Manager | Permitted customers and payments only |
| Warehouse keeper | Restricted / no access to Finance |

### 3.19 Core Backend Objects

| Object | Purpose |
|---|---|
| `Account` | A cash / bank account (currency-specific) |
| `Transaction` | An income, expense, or transfer record |
| `Counterparty` | Customer, supplier, or other external party |
| `TransactionType` | Category of income/expense (payment, tax, rent, …) |
| `Category` | Higher-level grouping for reporting |
| `Currency` | Currency definition and formatting rules |
| `DebtRelation` | Tracks amount owed to/by a counterparty |
| `LinkedDocument` | Reference to a related sale/purchase/debt document |

### 3.20 Recommended API

| Endpoint | Purpose |
|---|---|
| `GET /api/finance/summary` | Cash-flow KPIs (opening/closing balance, totals) |
| `GET /api/finance/accounts` | List of accounts and balances |
| `GET /api/finance/transactions` | Transactions journal, filterable |
| `POST /api/finance/income` | Create an income record |
| `POST /api/finance/expense` | Create an expense record |
| `POST /api/finance/transfer` | Create an inter-account transfer |
| `PUT /api/finance/transactions/{id}` | Edit a transaction |
| `DELETE /api/finance/transactions/{id}` | Delete a transaction (restricted) |

### 3.21 Scope: MVP (v1 mandatory)

- 3 core accounts (USD cash, UZS cash, Bank)
- Income
- Expense
- Inter-account transfer
- Link to counterparty
- Effect on counterparty debt calculated automatically
- Income / expense type
- Transactions journal
- Filter & search
- Account balances
- Income / Expense / Net cash flow
- Dashboard integration
- Link to Sales / Purchasing / Debt
- Audit log and role-based access

### 3.22 Key Business Rules

- Every real cash movement must have an explicit account and currency.
- Income and expense records may be linked to a counterparty.
- A counterparty's debt to us and our debt to a counterparty are tracked separately.
- Cash flow and debt are calculated independently but remain cross-referenced.
- Inter-account transfers are never counted as income or expense.
- A sale and the corresponding cash income are not the same event.
- A purchase and the corresponding cash expense are not the same event.
- Cost of goods sold is calculated independently of cash flow.
- Gross profit is calculated from sale amount and cost of goods sold.
- Dashboard pulls all financial KPIs automatically from the Finance module.

---

## 4. Implementation Roadmap

Because Dashboard is a pure aggregation layer on top of Finance (and Sales/Warehouse/Debt), Finance's core data model and MVP endpoints should be built first, or at minimum in parallel with a mocked data contract, so Dashboard has real data to render against.

### 4.1 Phase 0 — Foundation (prerequisite for both modules)

1. Define shared entities: `Account`, `Currency`, `Counterparty`, `Organization`, `Warehouse`.
2. Define role/permission model (Director, Accountant, Manager, Warehouse keeper) and apply it at the API layer, not just the UI.
3. Establish the multi-currency rule at the data layer: every monetary amount is stored with its currency and never auto-converted or summed across currencies.

### 4.2 Phase 1 — Finance MVP

4. Implement `Account`, `Transaction`, `TransactionType`, `DebtRelation`, `LinkedDocument` models.
5. Build `POST /api/finance/income`, `/expense`, `/transfer` with server-side validation (account + currency required, transfer excluded from cash-flow totals).
6. Build the Transactions journal (`GET /api/finance/transactions`) with filtering and the transaction detail card.
7. Implement automatic debt recalculation on every income/expense linked to a counterparty.
8. Implement `GET /api/finance/summary` (opening balance, total income, total expense, net cash flow, closing balance) and `GET /api/finance/accounts`.
9. Wire audit fields (created-by, created-at, edit history) and enforce restricted delete.

### 4.3 Phase 2 — Dashboard MVP

10. Build `GET /api/dashboard/finance` on top of Finance's summary/accounts endpoints.
11. Build `GET /api/dashboard/sales`, `/debts`, `/cash-flow`, consuming Sales, Debt, and Finance data respectively.
12. Assemble `GET /api/dashboard` as a single aggregated payload (or have the frontend call the sub-endpoints in parallel).
13. Build the period selector and wire it to all widgets via shared `date_from`/`date_to`/`organization_id`/`warehouse_id`/`currency` filters.
14. Build the KPI row, receivables/payables blocks, bank & cash blocks, cash-flow chart, and recent-transactions feed.
15. Apply role-based field/section visibility on both API and UI layers.

### 4.4 Phase 3 — Cross-module integration & Phase-2 features

16. Connect Sales → Finance (receivable creation, payment posting) and Purchasing → Finance (payable creation, payment posting).
17. Implement `GET /api/dashboard/alerts` (overdue receivables/payables, low stock, low cash-on-hand).
18. Add Top debtors / Top creditors, Sales dynamics chart, minimum-stock warnings, and multi-currency analytics views.
19. Performance pass: cache/aggregate heavy dashboard queries; add background recomputation if real-time aggregation becomes too slow.

### 4.5 Suggested Delivery Order Summary

| Stage | Deliverable |
|---|---|
| 0 | Shared entities, roles/permissions, currency rules |
| 1 | Finance MVP: accounts, income/expense/transfer, journal, summary API |
| 2 | Dashboard MVP: KPIs, receivables/payables, bank & cash, cash-flow chart, recent transactions |
| 3 | Cross-module wiring, alerts, and Phase-2 analytics |

---

## 5. Acceptance Checklist

### 5.1 Finance

- [ ] Income, expense, and transfer can be created, edited, and (where permitted) deleted.
- [ ] Transfers never appear in Income/Expense/Net cash flow totals.
- [ ] Multi-currency balances never sum across currencies.
- [ ] Linked counterparty debt updates automatically and correctly on every income/expense.
- [ ] Transactions journal filters (date, account, type, currency, counterparty, amount range) all work correctly together.
- [ ] Audit trail (creator, timestamps, edit history) is present on every transaction.
- [ ] Delete action is restricted to authorized roles only.

### 5.2 Dashboard

- [ ] All widgets update automatically when the period selector changes.
- [ ] No widget allows manual editing of a figure.
- [ ] Every KPI matches the equivalent figure in its source module (Finance, Sales, Debt, Warehouse).
- [ ] Role-based visibility hides unauthorized financial data everywhere on the page, including charts and alerts.
- [ ] Page is fully responsive on Desktop, Tablet, and Mobile.
- [ ] "View all" / block-click navigation correctly routes to the corresponding detail module (Counterparties, Finance → Transactions).
