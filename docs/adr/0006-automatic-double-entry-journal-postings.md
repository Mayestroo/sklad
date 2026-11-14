# 6. Automatic Double-Entry Journal Postings with Role-Gated Visibility

Operational actions (posting a receipt, unposting, returns, and payments) automatically generate strict BHMS double-entry journal entries behind the scenes (Accounts 2910, 4410, 6010, 5110/5010). General users interact exclusively through business concepts (warehouses, prices, debts), while journal entries are displayed only to authorized Accountant and Admin roles via collapsible audit sections.


## Finance transactions (2026-11)

Every Finance income, expense and transfer posts its own entry keyed `sourceDocType: 'FinanceTransaction'`, `sourceDocId: <transaction id>`; cancelling or deleting the transaction deletes exactly that entry. Income/expense: cash/bank ledger account (5010/5020/5110/5210) against 4010 (customer settlement), 6010 (supplier settlement), or 9390 / 9430 (other operating income / expenses) when there is no counterparty. Cash is valued at the payment rate; the settlement side at each applied document's own rate and any unapplied advance at the payment rate, the difference going to 9540 / 9620. Transfers post Dt target / Kt source at the UZS value of the movement. Purchase payments use the same key. A cash payment made when an additional expense is posted as paid is part of that expense's own entry, so it is reversed by cancelling the expense, not from Finance.
