## Parent

Part of #12

## What to build

Operators can attach direct ancillary purchase expenses (`PurchaseExpense` — such as transport, customs duties, brokerage, insurance, and cargo handling) to draft purchase receipts. The system mathematically allocates these expenses across line items based on the chosen `ExpenseAllocationMethod` (`BY_AMOUNT`, `BY_QUANTITY`, `BY_WEIGHT`), computing accurate item `landedCost`. Adapts to company tax regimes by capitalizing input VAT into landed cost for non-VAT payers (ADR-0003).

## Acceptance criteria

- [ ] Operator can add, edit, and remove direct purchase expenses on a draft receipt with amount, currency, expense type, and optional 3rd-party supplier.
- [ ] Each expense supports allocation method selection: `BY_AMOUNT` (proportional to total line price), `BY_QUANTITY` (proportional to item count), or `BY_WEIGHT` (proportional to total item weight).
- [ ] Landed cost engine calculates allocated expenses per line item and computes the resulting unit `landedCost`.
- [ ] Company tax regime check: for non-VAT payers, input VAT is capitalized into the item landed cost; for VAT payers, VAT is kept separated for account 4410.
- [ ] Advanced import disclosures section supports GTD number, GTD date, and customs post for cross-border purchases.
- [ ] Automated integration tests verify mathematical precision for all three allocation algorithms and VAT capitalization.

## Blocked by

- #13 (Purchases: Core Purchase Receipt Creation & Draft Management)
