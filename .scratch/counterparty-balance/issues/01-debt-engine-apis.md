# T1: Counterparty Debt Engine, Aggregation APIs (Summary & Filter) & Multi-Currency Grounding

## Parent
#124

## What to build
Standardize the counterparty debt calculation engine, aggregation endpoints (`GET /api/v1/contacts/summary` and `GET /api/sales/counterparties/summary`), and balance filter query logic (`balanceFilter=all|receivables|payables|settled`).
- Standardize debt formulas:
  - Customer Receivables: `customerDebt = Total_Sales_Invoiced - Total_Payments_Received`
  - Supplier Payables: `supplierDebt = Total_Purchases_Invoiced - Total_Payments_Made`
  - Net Balance: `netBalance = customerDebt - supplierDebt`
- Enhance `getSummary`:
  - `total_customers`: count of entities with type in [`CUSTOMER`, `BOTH`]
  - `total_suppliers`: count of entities with type in [`SUPPLIER`, `BOTH`]
  - `receivables`: count of entities with open receivables and aggregate sum in UZS equivalent
  - `payables`: count of entities with open payables and aggregate sum in UZS equivalent
  - Support gross aggregation for hybrid entities (`type: BOTH`), reporting both debts without premature offsetting
- Enhance `findAll`:
  - Support `balanceFilter`:
    - `all`: all counterparties
    - `receivables`: counterparties where `customerDebt > 0` (or `netBalance > 0` for hybrid)
    - `payables`: counterparties where `supplierDebt > 0` (or `netBalance < 0` for hybrid)
    - `settled`: counterparties where `netBalance = 0` (or both debts are 0)
- Guardrails: Block deletion of counterparties with outstanding debts or linked transactions.

## Acceptance criteria
- [ ] `getSummary` returns exact schema `{ total_customers, total_suppliers, receivables: { count, total_amount }, payables: { count, total_amount } }`
- [ ] Hybrid counterparties (`type: BOTH`) with both customer and supplier debt are accounted on both sides in `getSummary`
- [ ] `findAll` with `balanceFilter=receivables` correctly returns debtor records
- [ ] `findAll` with `balanceFilter=payables` correctly returns creditor records
- [ ] `findAll` with `balanceFilter=settled` returns zero-balance records
- [ ] All unit tests in `counterparties.service.spec.ts` pass cleanly

## Blocked by
- None — can start immediately.
