# 25. Opening Balances: Self-Balancing Equity and One Posting per Module

## Context
The opening-balance page asked the user to make assets equal liabilities plus
equity by hand (a "balance difference" card and a "balance with capital"
button), across seven tabs with an exchange rate on every row. Posting was
also only partly connected to the rest of the system:

- the journal entry covered cash, inventory, customer debts, supplier debts
  and equity only; supplier/customer advances, fixed assets and other
  assets/liabilities reached account 00 on one side only, and equity was
  skipped silently when account 8330 did not exist (it was not in the
  default chart), so 00 did not close;
- opening inventory batches were created directly (not through
  `createFifoBatch`), dated "now" rather than the opening date, and unposting
  deleted batches by a 15-character batch-number prefix, which could match
  another opening document's batches;
- a debt line without a counterparty, or an inventory line without a
  warehouse, counted in the totals and the journal but reached no
  settlement or stock;
- an opening fixed asset had to be linked to a register asset (D6), but no
  screen could create one.

## Decision
1. **Equity balances itself.** The user enters what the company has and
   owes, plus ustav kapitali if known. The balancing figure
   (assets − liabilities − entered capital) is posted to **8710 Retained
   earnings** (credit when positive, debit when negative). Posting no longer
   requires a zero difference; the `balance-equity` endpoint is removed.
   The rules live in `shared/types/opening-balance-posting.ts` and are used
   by both the page and the server.
2. **Every category has a ledger account**, posted against 00 and summed
   per account, so 00 always nets to zero:
   CASH/BANK → kassa ledger (5010/5020/5110/5210), INVENTORY → 2910,
   CUSTOMER_DEBT → Dt 4010, CUSTOMER_ADVANCE → Kt 4010,
   SUPPLIER_DEBT → Kt 6010, SUPPLIER_ADVANCE → Dt 6010 (the accounts
   customer and supplier payments use), FIXED_ASSET → Dt 0100 cost and
   Kt 0200 accumulated depreciation, OTHER_ASSET → 4890,
   OTHER_LIABILITY → 6990, EQUITY → 8330. 00, 0100, 0200, 4890, 6990, 8330
   and 8710 join the default chart; a missing account fails the posting
   instead of skipping a line (ADR 0022).
3. **Inventory** posts through `createFifoBatch`, dated at the opening date
   (oldest FIFO layer) and linked to its line
   (`product_batches.opening_balance_line_id`). Unposting deletes exactly the
   linked batches; documents posted before the link fall back to the exact
   batch number the old posting gave. An inventory line is worth
   quantity × unit cost on the server, whatever total was sent. A product
   whose catalog cost is 0 takes the opening cost (ADR 0007).
4. **Lines must say where they go.** Posting refuses, before any write,
   cash lines without a kassa, inventory lines without product, warehouse,
   positive quantity or cost, and debt/advance lines without a counterparty.
5. **One USD rate per document.** An opening balance is a snapshot at one
   date, so the page keeps one USD rate and writes it onto every USD line;
   the server still stores and validates a rate per line.
6. **Simpler page.** Five tabs (money, goods, debts & advances, fixed
   assets, capital & other); "Post" saves first; a posted document links to
   Finance, Inventory, Counterparties and the Journal. A missing fixed asset
   is added to the register from the line, with an optional straight-line
   depreciation suggestion at the opening date (owner option O1-c, a helper
   only — nothing depreciates after posting).

## Consequences
- Existing posted documents keep their old journal entry; unposting and
  reposting them produces the complete entry.
- Users can no longer be blocked by a non-zero difference; a wrong amount
  shows up as an unexpected retained-earnings figure on the summary card.
- Depreciation after the opening date is still not computed (D6 unchanged).
