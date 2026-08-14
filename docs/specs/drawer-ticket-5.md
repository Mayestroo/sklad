# Ticket 5: Finance Cash Movements & Conversions Drawer Migration

## Parent

Part of #19

## What to build

Migrate the cash transaction forms (Income, Expense, Transfer, Currency Conversion) on `/finance` to the new Slide-Over Drawer standard.

## Acceptance criteria

- [ ] Replaces modal on `/finance` with `CreateFinanceTransactionDrawer`.
- [ ] Supports tabs/selectors for `INCOME` (Kirim), `EXPENSE` (Chiqim), `TRANSFER` (O‘tkazma), and `CONVERSION` (Konvertatsiya).
- [ ] Dynamically displays target accounts, currency conversion exchange rates, and cash account balances.
- [ ] Submitting immediately updates account balances and transaction journal list.
- [ ] Keyboard accessible with `Esc` dismiss and `Ctrl+Enter` submit.

## Blocked by

- #20 (Drawer UI: Core Slide-Over Drawer Component & Accessibility Framework)
