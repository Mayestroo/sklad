## Parent

Part of #34 (Spec) / Part of #35 (Map)

## What to build

Implement safe document cancellation (`cancelExpense`), rollback guardrails, and complete end-to-end invariant test coverage:
1. **Rollback Guardrail Enforcement**: Reject cancellation of a posted additional expense if an active linked cash payment exists in the finance module, requiring the user to void the payment transaction first.
2. **Reversal Engine**: Upon cancellation, cleanly decrement `ProductBatch.landedCost`, revert retroactive COGS adjustments on affected `SalesInvoiceItem`s and `SalesInvoice`s, void or reverse linked journal entries, reduce counterparty debt balance if unpaid, and transition document status to `CANCELLED`.
3. **Frontend Cancellation Workflow**: Interactive cancellation modal on `/purchases/expenses/[id]` with safety warnings, guardrail validation messages, and immediate UI state refresh upon completion.
4. **Comprehensive Invariant Test Suite (`additional-expense-invariant.spec.ts`)**:
   - Invariant 1: Unsold goods landed cost allocation & catalog sync.
   - Invariant 2: Partially sold goods retroactive COGS split & profit delta.
   - Invariant 3: Multi-expense chaining (freight + customs + handling) compounding on single receipt.
   - Invariant 4: Rollback guardrail blocking when cash payment exists, and clean reversal upon payment void.
   - Invariant 5: Remainder rule guaranteeing zero fractional drift.

## Acceptance criteria

- [ ] Cancellation is blocked with an explanatory error message if active linked cash transactions exist.
- [ ] Cancellation cleanly restores batch landed costs and downstream sales invoice COGS figures.
- [ ] Linked journal entries and counterparty balances are reversed accurately.
- [ ] `/purchases/expenses/[id]` provides an intuitive cancellation flow with clear feedback.
- [ ] All automated tests in `additional-expense-invariant.spec.ts` pass 100% green.

## Blocked by

- #38 (Ticket 3)
