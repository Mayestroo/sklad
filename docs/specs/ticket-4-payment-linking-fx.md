## Parent

Part of #12

## What to build

Financial payments made from bank or cash accounts in the Finance module can be linked directly to outstanding purchase receipts (or allocated automatically via FIFO). Settling payments decrements supplier accounts payable debt, updates the purchase receipt's independent payment status (`UNPAID` -> `PARTIALLY_PAID` -> `PAID`), and automatically recognizes and journals foreign exchange differences (9620/9430 accounts) for multi-currency transactions.

## Acceptance criteria

- [ ] Financial payments (`FinanceTransaction` / `Payment`) can be linked to specific posted purchase receipts.
- [ ] Supplier accounts payable (`Counterparty.debtBalance`) decreases by the exact paid amount.
- [ ] Receipt payment status transitions orthogonally (`UNPAID`, `PARTIALLY_PAID`, `PAID`) with real-time `paidAmount` and remaining debt calculation.
- [ ] Advance payments made to a supplier create a `Supplier Advance` credit balance applicable to future receipts.
- [ ] Multi-currency payments in foreign currency (e.g. USD) automatically calculate exchange rate differences between document date and payment date, recording BHMS FX gain/loss journal entries.
- [ ] Purchase receipt details view shows complete linked payment history table with dates, methods, accounts, and amounts.
- [ ] Automated integration tests verify payment allocation, debt decrement, and FX accounting entries.

## Blocked by

- #15 (Purchases: Warehouse Posting, FIFO Product Batches & BHMS Postings)
