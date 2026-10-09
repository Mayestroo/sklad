# Counterparty Settlement Ledger Design

## Context

The requested fixes in `muammolar.pdf` span sales, finance, opening balances, purchases, warehouse operations, and counterparty balances. The selected first workstream is sales and counterparty debt. An audit of the current debt writers shows that it cannot be fixed reliably inside the sales screens alone:

- Posted sales invoices, sales returns, purchase receipts, purchase returns, service acts, opening balances, and finance settlements all affect counterparty balances.
- These flows update `Counterparty.debtBalance`, `customerDebt`, `supplierDebt`, and `CounterpartyBalance` inconsistently. For example, some purchase payments and service-act unposts change the scalar balance without changing the currency balance; unpaid additional purchase expenses also update only the scalar balance.
- Order-linked prepayments are applied to a counterparty before dispatch, while dispatch creates an invoice and adds its receivable. Their currency-specific outstanding balance must include both movements without counting the payment twice.
- `debtBalance` has no currency dimension. Screens that use it to label an amount with a guessed or recent document currency can show a numerically plausible but incorrect balance.
- `CounterpartyBalance` already separates `customerDebt` and `supplierDebt` by currency, but it is updated directly by individual modules and is not a complete, rebuildable record of how those values were produced.

The existing domain decisions remain in force: customer and supplier obligations are accrued by operational documents; physical money movement remains in Finance; sales and purchase returns reverse the originating document's balance effect; and values in different currencies are never combined without an explicit conversion.

## Goals

1. Establish one auditable source for customer and supplier settlement movements across every existing debt-producing module.
2. Keep each movement in its native currency and preserve customer and supplier sides independently.
3. Make current per-currency balances rebuildable and reconcile them against historical business records.
4. Allocate payments to documents without applying a payment more than once, while retaining unapplied amounts as currency-specific advances.
5. Make counterparty, finance, and dashboard balance views read currency-specific balances rather than the unqualified scalar `debtBalance`.

## Design

### 1. Append-only settlement ledger

Add a `CounterpartySettlementEntry` record as the canonical history of changes to a counterparty's financial position. Each entry contains:

- tenant and counterparty IDs;
- the explicitly validated currency (`USD` or `UZS`);
- the balance side (`CUSTOMER` or `SUPPLIER`);
- a signed amount in that currency;
- an entry kind, effective date, source document type and ID, optional source line ID, and creation metadata;
- an optional reference to the entry being reversed.

Positive customer-side amounts increase receivables; negative customer-side amounts reduce receivables or create a customer advance. Positive supplier-side amounts increase payables; negative supplier-side amounts reduce payables or create a supplier advance. A currency is never inferred from a different document or from the company's current default.

Entries are immutable. Posting a document appends its movement. Unposting, cancellation, or correction appends the inverse movement and links it to the original; existing ledger history is not edited or deleted. An idempotency key on the source event prevents retries from recording the same movement twice.

### 2. Explicit payment allocation and advances

Add `SettlementAllocation` records to preserve which payments satisfy which documents. An allocation records the payment source, target document, counterparty, currency, amount, and allocation/reversal history. Targets include sales invoices/orders, purchase receipts/additional expenses, and service acts. A Finance transaction that changes a counterparty balance stores an explicit `settlementSide` (`CUSTOMER` or `SUPPLIER`). Linked source documents determine the side; an unlinked settlement requires the side to be selected. Direction alone is not enough for a `BOTH` counterparty or a refund.

For an explicitly selected side, a customer receipt (`INCOME`/`CUSTOMER`) and supplier payout (`EXPENSE`/`SUPPLIER`) reduce that obligation. A customer refund (`EXPENSE`/`CUSTOMER`) and supplier refund (`INCOME`/`SUPPLIER`) increase it toward zero or reverse an advance. The signed movement follows the obligation being settled, not merely whether cash direction is `INCOME` or `EXPENSE`. Allocations:

- can only connect the same counterparty and currency;
- cannot exceed the payment's unapplied amount or the target document's open amount;
- use FIFO for unlinked Finance receipts and payouts, matching the existing behavior;
- remain linked to their original payment source when an advance is later applied to an invoice or receipt; dispatching an order appends an allocation reversal from the order and a new invoice allocation, but no second cash or balance movement;
- record reversals as new allocation events rather than changing or deleting historical allocations;
- leave any unapplied remainder as a negative balance on the relevant side, i.e. an advance, until it is applied or refunded.

`FinanceTransaction` is the source of each real cash movement. A related `Payment` record is metadata for that movement and must not create a second ledger movement. Order-linked payments remain order-linked; when dispatch creates an invoice, settlement allocation associates the order payment with the invoice without duplicating the cash movement. For an unlinked transaction that affects a counterparty balance, the user selects which side it settles. Source-specific transactions that do not settle a payable or receivable, such as a paid additional purchase expense, are marked as having no settlement effect and do not create a ledger entry.

The existing document `paidAmount` and payment status fields continue to serve operational document workflows, but their values must be consistent with active allocations. Updating those fields and the settlement ledger/allocation records occurs in the same database transaction.

### 3. One posting boundary for every debt source

Introduce a shared `CounterpartySettlementService` that receives the active Prisma transaction client. Operational modules call it inside their existing transaction so the source document, journal posting, settlement ledger entry, allocation changes, and balance projection either all commit or all roll back.

The service handles these source events:

- `SalesInvoice` posting: increase customer-side balance by the invoice total, including output VAT.
- `SalesReturn` posting: decrease customer-side balance by the returned total, including the original invoice's proportional VAT.
- `PurchaseReceipt` posting: increase supplier-side balance by the payable total.
- `PurchaseReturn` posting: decrease supplier-side balance according to the return accounting already defined for the purchase document.
- Unpaid `AdditionalExpense` posting: increase supplier-side balance. An immediately paid additional expense records its cash movement without also creating a payable.
- `ServiceAct` posting: increase customer-side balance for `PROVIDED`, or supplier-side balance for `RECEIVED`.
- Posted opening-balance lines: establish the corresponding customer or supplier opening movement in the line's currency. Customer and supplier advance lines establish negative movements on their respective sides.
- Posted Finance transactions with a counterparty and a settlement effect: create a movement on the explicitly selected or source-derived side in the Finance transaction's currency; any unallocated part remains an advance. Paid operational expenses without an accrued payable have no settlement effect and store no `settlementSide`.
- Reversals/unposts of the above: append inverse entries, subject to the existing rollback invariants.

No module writes debt totals directly. The shared service also owns validation for counterparty tenant, currency, side, source identity, allocation bounds, and duplicate posting.

### 4. Rebuildable currency projection

Keep `CounterpartyBalance` as a materialized projection, not an independent source of truth. Its unique key remains counterparty plus currency, with separate signed `customerDebt` and `supplierDebt` amounts. The shared settlement service updates ledger entries and projection rows atomically.

Provide a rebuild operation that groups ledger entries by tenant, counterparty, currency, and side and replaces the projection from those sums. A reconciliation operation compares the stored projection with the rebuilt values and reports source-level differences.

`Counterparty.debtBalance` is deprecated because it cannot represent multiple currencies or distinguish the source currency. No screen or business decision may use it as a currency-bearing amount. Remove its writes and reads during migration; retire the database field after application references have been removed.

### 5. Read APIs and counterparty workflows

All counterparty summaries, detail balances, finance debt views, sales customer summaries, and dashboard debt KPIs read the currency projection. The API returns per-currency `customerDebt`, `supplierDebt`, and the existing domain-defined per-currency net position (`customerDebt - supplierDebt`). It never returns an aggregate across currencies as if it were a native amount.

Counterparty UI displays each active currency separately. For each currency, it distinguishes customer receivable/customer advance and supplier payable/supplier advance; if both customer and supplier positions exist, it shows both gross positions and the per-currency net position. Payment actions are selected by side and currency, not inferred from one scalar net balance. The cash/bank account must match the selected payment currency.

Sales and purchase payment allocation uses the same counterparty/currency rules. A customer and supplier obligation in the same currency can be shown net as the domain summary requires, but payment allocation never settles a sales invoice with a purchase receipt implicitly.

### 6. Historical migration and cutover

Migration runs in additive, verifiable stages:

1. Add the settlement ledger, allocation, `settlementSide`, idempotency, and reconciliation structures.
2. Backfill opening movements and effective posted document/return/finance movements using each source document's own currency.
3. Treat a Finance transaction as the cash source when it is linked to a `Payment`; do not backfill both records as separate cash movements.
4. Reconstruct document allocations where source links and payment records provide enough evidence. Preserve order-linked prepayment identity. Derive settlement side from a linked source where possible; ambiguous unlinked transactions are reconciliation exceptions rather than guessed from `INCOME`, `EXPENSE`, or counterparty type.
5. Rebuild `CounterpartyBalance` from the ledger, then compare it with the previous currency rows, legacy scalar values, and document `paidAmount` values.
6. Produce a tenant/counterparty/currency/side reconciliation report. Any amount that cannot be derived with a known currency is an explicit exception requiring a correction; it is never assigned the company default currency silently.
7. Switch all writers and readers to the shared service/projection, run reconciliation, and retire scalar balance dependencies.

The backfill is repeatable and idempotent. A dry-run mode reports entries and differences without changing live projections. Applying the repair preserves a before/after reconciliation artifact for audit.

### 7. Related workstreams from the PDF

The ledger is the foundation for the selected sales-and-debt workstream. The accepted follow-on sequence is:

1. **Sales document correctness:** persist product sale-price currency; migrate existing prices from each company's established sales default currency and report any product without a recoverable currency; remove price-list selectors from sales forms while retaining historical price-list data; calculate percentage discounts consistently; add line-level VAT to orders and propagate it through partial dispatch, invoices, and proportional returns; repair draft invoice `PATCH`; and calculate profit in the document currency by converting UZS FIFO COGS with the document exchange rate. `grossProfit` remains net sales revenue excluding VAT minus COGS; expose `profitAfterSalesExpenses` separately.
2. **Sales expense behavior:** show an expense table inside the invoice. Expenses do not change invoice total or customer debt. They reduce `profitAfterSalesExpenses` in the invoice currency, can be recorded on draft or posted invoices, and have an audit trail. Their real cash movement is recorded separately in Finance and can link back to the expense. Sales returns do not automatically reverse a company expense that was already incurred.
3. **Numeric entry and currency formatting:** fix zero-overwrite behavior across numeric inputs; use formatted editable controls for monetary and price fields throughout the frontend; preserve precise raw values while editing and apply separators on blur.
4. **Opening balance, finance expense, and warehouse flows:** implement separate USD cash, UZS cash, and bank opening balances; route opening USD to the USD cash account; revise the opening-balance screen and its review/confirmation flow; add expense category, currency, and counterparty quick-add flows; display optional fields as optional; and repair the reported missing warehouse selection in return workflows.

Each workstream uses the settlement ledger for any customer/supplier balance effect and receives its own implementation plan and focused verification.

## Error handling and invariants

- Unsupported or missing currency, non-positive required exchange rate, cross-currency allocation, wrong-tenant source, over-allocation, and duplicate source posting fail explicitly inside the transaction boundary.
- No financial amount is silently relabeled or summed across currencies.
- A failed ledger/projection write rolls back the originating document status and journal posting.
- Unpost/cancel follows existing rollback guards and records a reversal only after the guard passes.
- Rebuild is deterministic: identical ledger rows yield identical `CounterpartyBalance` rows.
- No historical repair silently guesses currency or rewrites source documents to mask a discrepancy.

## Acceptance criteria

1. Every listed debt-producing source changes the correct counterparty, explicitly classified side, and native-currency ledger balance exactly once. A Finance transaction that settles an unlinked balance cannot be posted without its settlement side.
2. Sales/purchase/service/opening-balance reversals append inverse entries and restore the prior projection without deleting history.
3. Direct and FIFO settlements create auditable allocations, update document paid amounts consistently, and leave excess payments as same-currency advances.
4. A tenant with USD and UZS activity sees separate customer and supplier positions; no aggregate is mislabeled with a single currency.
5. A counterparty with both customer and supplier activity can see each gross side, net within each currency, and choose the correct side/currency when recording settlement.
6. Rebuilding projections from ledger entries reproduces stored balances, and reconciliation exposes any non-reconstructable historical amount.
7. Duplicate requests and concurrent retries cannot create duplicate source movements or allocations.
8. The related sales, numeric-input, opening-balance, finance-expense, and warehouse workstreams use the same currency and settlement invariants as they are implemented.

## Verification design

- Unit-test movement sign and projection updates for each entry type and reversal.
- Service-level test each source writer using an active Prisma transaction fake and assert ledger, allocation, projection, and source document changes commit together.
- Test FIFO allocation, partial settlement, customer/supplier advances, customer and supplier refunds, order prepayment followed by dispatch, multiple currencies, and a `BOTH` counterparty with simultaneous receivable/payable balances.
- Test idempotency under duplicate posting and race/concurrency conditions at the database constraint seam.
- Test backfill against fixtures with opening balances, sales and purchase documents, returns, service acts, linked and unlinked finance transactions, paid additional expenses, and orphan scalar balances.
- Test API/UI rendering with multiple currencies and ensure no scalar balance receives a guessed currency label.
- Run Prisma migration validation, focused backend tests, frontend tests/lint, and a full build after the affected workstreams are implemented.
