# 2. Pre-Inbound Landed Cost Allocation

Direct ancillary purchase expenses (transport, customs duties, brokerage) are attached to the draft purchase receipt and allocated across line items prior to posting. Once posted, the product batch unit cost is locked to avoid retroactive cost revaluations on inventory items that may already have been dispatched through sales invoices.

## Amendment (2026-11-20): who is owed a receipt expense

Every receipt expense goes into landed cost (`additionalExpensesTotal`), but
the payable follows the expense supplier. An expense with no supplier, or with
the receipt's own supplier, is on that supplier's invoice and is part of the
receipt total (`totalAmount`, the receipt supplier's payable). An expense with
another supplier is owed to that supplier: posting records a
`PURCHASE_EXPENSE_POSTED` settlement movement for it (`sourceDocType`
`PurchaseExpense`), and unposting reverses what the ledger holds for it. The
journal is unchanged: inventory takes every expense and 6010 is credited in
full. Code: `splitReceiptExpensesByPayee` / `receiptSupplierTotal` in
`expense-allocation.engine.ts`.

Editing a draft replaces its lines, so the receipt expenses are spread again
over the new lines (each by its own method), and `additionalExpensesTotal` is
the sum of the receipt expenses. Posting re-spreads them as well when the
line shares do not add up to the expenses, so the batch cost and the journal
always carry the same amount (`allocateReceiptLines`).
