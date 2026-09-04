# T3 — 1-Click Otgruzka (Auto-SalesInvoice, FIFO Deduction, and Debt Invariant)

**Parent:** #73
**GitHub Issue:** #76
**Status:** ready-for-agent
**Blocked by:** #75

## What to build
Transitioning an order to `SHIPPED` or clicking 'Otgruzka' in 1 click triggers an atomic transaction that generates a posted `SalesInvoice` referencing the `SalesOrder`, deducts physical inventory batches via FIFO, consumes the stock reservations, increments customer `debtBalance`, and marks order `SHIPPED`.

## Acceptance criteria
- [ ] Transition to `SHIPPED` auto-generates sequential `SalesInvoice` linked via `salesOrderId`.
- [ ] Product batches are deducted via FIFO with accurate `unitCogs` and `grossProfit`.
- [ ] Stock reservations are consumed atomically; physical stock decremented.
- [ ] Counterparty `debtBalance` is incremented by invoice total.
- [ ] Insufficient physical stock aborts the transaction safely.
- [ ] Automated tests verify atomic posting and invariants.
