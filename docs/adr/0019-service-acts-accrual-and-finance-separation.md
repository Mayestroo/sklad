# 19. Service Acts Accrual and Finance Separation

## Context
Service transactions (both services provided to customers and services received from vendors) create financial obligations (`debtBalance`) and accounting recognitions (revenue or expense) without moving physical warehouse stock or creating inventory batches.

Previously, operational modules had a tendency to either mix cash collection buttons into operational documents or record service expenses only as cash payouts, omitting formal accrual accounting and contractual acts of completion.

## Decision
1. **Strict Separation of Concerns**: The Services module records solely the operational reality and monetary accrual of services rendered (`PROVIDED`) or received (`RECEIVED`). It contains no cash or bank execution buttons.
2. **Accrual-Based Obligation**:
   - Posting a `PROVIDED` act immediately increases Customer Debt (Debitorlik / Receivables) and recognizes Service Revenue (Account 9030) + VAT Payable (Account 6410).
   - Posting a `RECEIVED` act immediately increases Supplier Debt (Kreditorlik / Payables) and recognizes Operating Expense (Account 9420/9430) + Input VAT (Account 4410).
3. **Decoupled Financial Settlement**: All payments (inbound customer receipts or outbound vendor payouts) are executed exclusively through the Finance module (`FinanceTransaction`). The transaction links to the `ServiceAct` via `sourceDocType: 'ServiceAct'` and `sourceDocId`, atomically updating `paidAmount` and `paymentStatus` (`UNPAID` → `PARTIALLY_PAID` → `PAID`).
4. **Service Rollback Invariant**: A posted `ServiceAct` cannot be cancelled or deleted if any linked financial settlements exist.
