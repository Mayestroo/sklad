# T3: Grid Balance Formatting (+/- badges), 1-Click Payment Action & Reconciliation Statement Drawer

## Parent
#124

## What to build
Implement visual grid enhancements, in-grid 1-click debt settlement, and the reconciliation statement (Akt sverka) drilldown drawer.
- Data Grid `QARZ BALANSI` Column:
  - Positive balance (`netBalance > 0`): `+ {formatCurrency(netBalance)}` in emerald green (`#10b981`)
  - Negative balance (`netBalance < 0`): `- {formatCurrency(Math.abs(netBalance))}` in crimson red (`#ef4444`)
  - Zero balance: `{formatCurrency(0)}` in neutral slate gray
  - Customer advance indicator: "Avans olindi" badge when customer has negative debt / prepayment credit
- In-grid 1-Click Payment Action:
  - Add quick action button in table action column: "To'lov kiritish"
  - For debtors: opens payment modal with `INCOME` type, counterparty pre-selected, and debt amount pre-filled
  - For creditors: opens payment modal with `EXPENSE` type, counterparty pre-selected, and debt amount pre-filled
- Reconciliation Statement (Akt sverka) Drilldown:
  - Clicking on the balance amount opens `AktSverkaDrawer` (or statement modal)
  - Displays chronological ledger: initial balance, sales invoices, purchase receipts, payments, returns, and closing balance
  - Print / Export friendly layout for counterparty sign-off

## Acceptance criteria
- [ ] Table `QARZ BALANSI` column displays `+` (green), `-` (red), and `0` (gray) with proper currency formatting
- [ ] Customer advances are cleanly badged without being disguised as trade supplier debt
- [ ] Clicking in-grid payment action opens payment dialog with counterparty and amount pre-filled
- [ ] Clicking balance opens reconciliation drawer detailing transaction history
- [ ] Full frontend and backend test suites pass with zero regressions

## Blocked by
- #126 (Ticket 2)
