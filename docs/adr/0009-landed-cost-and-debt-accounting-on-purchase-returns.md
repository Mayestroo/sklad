# 9. Landed Cost and Supplier Payable Accounting on Purchase Returns

When a purchase return document is posted for inventory that previously received allocated purchase expenses (such as freight or customs duties), the unit valuation used for inventory asset reduction (Debit 2910 credit) is the item's actual landed cost (`landedCost`), whereas the reduction in supplier debt (Credit 6010 debit) is strictly calculated using the supplier's original base purchase price (`unitPrice`). Any non-refundable difference resulting from allocated third-party expenses is automatically written off as a Landed Cost Return Expense Loss, preserving double-entry accounting integrity without improperly reducing counterparty payable balances.

## Amendment (2026-11-13): landed cost below the base price (owner decision D2)

When the returned goods leave at a landed cost *below* their base price (for
example a USD receipt whose batches were costed at a lower rate), the supplier
payable (6010) is still reduced by the full base price, and the gap is credited
to the account the accountant configures in company settings:
`Company.settings.accounting.purchaseReturnGainAccountCode` (a 4-digit code that
must exist in the tenant's chart of accounts; `PATCH /api/tenants/settings`).
There is deliberately no default account. If the setting is missing, posting
the return fails with a clear bilingual error instead of leaving 6010 out of
line with the counterparty settlement. Code: `PurchasesService`
`purchaseReturnGainAccount`, tests in `purchase-returns.spec.ts` (D2).
