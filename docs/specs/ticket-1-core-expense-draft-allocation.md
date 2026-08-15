## Parent

Part of #34 (Spec) / Part of #35 (Map)

## What to build

Operators can create, view, edit, and manage standalone additional purchase expenses in `DRAFT` status and perform mathematical cost allocation across selected line items of a posted purchase receipt:
1. **Schema & Models**: `AdditionalExpense` and `AdditionalExpenseItem` models in Prisma schema with all essential fields (`docNumber` in `EXP-YYYY-XXXX` format, date, expense type, counterparty, receipt link, amount, currency, exchange rate, allocation method `BY_AMOUNT`, `BY_QUANTITY`, `BY_WEIGHT`, VAT fields, payment mode, comments, audit logs).
2. **Backend Allocation Engine**: API endpoints for creating, updating, retrieving, and calculating expense distribution across selected receipt items. Implements the `Allocation Remainder Rule` (distributing fractional tiyin/cent remainders onto the highest-value line item so sum strictly equals total amount).
3. **Frontend UI & Interactive Preview**: Form at `/purchases/expenses/new` allowing operators to select a purchase receipt, check/uncheck specific goods or raw materials, select an allocation rule, and view a live Before vs After landed cost comparison grid (Initial unit cost, Allocated expense, New landed cost, and Cost increase %) before saving as draft. Drafts are listed on `/purchases/expenses`.
4. **Automated Tests**: Unit and integration tests verifying schema relations, CRUD operations, allocation math precision, and remainder redistribution.

## Acceptance criteria

- [ ] Operator can create a new additional expense draft with auto-generated document number (`EXP-YYYY-XXXX`).
- [ ] Selecting a posted purchase receipt loads its line items into an interactive table.
- [ ] Operator can toggle checkboxes to allocate expenses to all or specific items.
- [ ] Proportional allocation calculates accurately across `BY_AMOUNT`, `BY_QUANTITY`, and `BY_WEIGHT`.
- [ ] Remainder rule guarantees `sum(allocatedAmount) == headerAmount` across all rounding test cases.
- [ ] Draft can be saved, listed, viewed, and updated without affecting inventory batches or general ledger until posted.
- [ ] Automated tests verify end-to-end draft lifecycle and allocation calculations.

## Blocked by

None — can start immediately.
