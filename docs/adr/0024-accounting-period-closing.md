# 24. Accounting Period Closing

## Context
Any document date could be posted, unposted or cancelled at any time,
including documents in months whose figures were already reported (owner
decision D4; the first concrete case was cancelling a posted sales return
dated in an already reported month, item A1). The product had no notion of
a closed period.

## Decision
1. **Monthly periods.** An *accounting period* is a UTC calendar month of one
   tenant's books (`accounting_periods`: tenant, year, month, status
   `OPEN`/`CLOSED`, who/when closed and reopened). No row means `OPEN`.
   Monthly was chosen because reporting in Uzbekistan is monthly/quarterly
   and closing a year is closing its twelve months. UTC because document
   dates are stored as UTC midnight of the chosen day.
2. **The rule.** While a period is `CLOSED`, nothing dated in it may change
   the books. `assertPeriodOpen(db, tenantId, dates, action)`
   (`backend/src/common/accounting-period/period-lock.ts`) rejects the
   action with a bilingual `400` naming the period.
3. **Where it is enforced.**
   - `JournalService.createJournalEntry` (the only creator of journal
     entries) checks the entry date. This covers every posting whose entry
     carries the document date, and manual journal entries.
   - `JournalService.deleteEntriesForSource` is now the only way journal
     entries are deleted (unposting/cancelling); it checks the dates of the
     entries it removes. Direct `journalEntry`/`journalLine` writes outside
     `JournalService` fail `period-lock.spec.ts`.
   - Lifecycle methods that change the books without (only) a journal entry
     carrying the document date check the document date themselves:
     purchase receipt unpost, purchase/sales return cancel, sales invoice
     unpost, additional expense cancel, opening balance unpost, service act
     post/cancel/unpost, stock transfer ship/receive, production
     complete/cancel, finance income/expense/transfer create and the
     reversal used by cancel and delete. The list is pinned in
     `period-lock.spec.ts`; a new lifecycle method must be added to it.
   - Not checked, by design: payments and inventory documents have no
     document date (they are dated "now"), and a month cannot be closed
     before it has ended. Draft-only deletes do not touch the books.
4. **Concurrency.** Every check takes a shared transaction-scoped advisory
   lock per period; closing and reopening take the exclusive one. A posting
   in flight when its month is being closed either commits first or sees
   the period closed.
5. **Who.** New permission actions `accounting:close` and
   `accounting:reopen`. `company_admin` and `super_admin` hold both; the
   `accountant` role may close but not reopen. Close/reopen write an audit
   log row (`entityType = AccountingPeriod`) in the same transaction.
6. **API.** `GET /api/accounting/periods/:year`,
   `POST /api/accounting/periods/:year/:month/close`,
   `POST /api/accounting/periods/:year/:month/reopen`.

## Consequences
- Editing a posted document of a closed month (unpost → modify → repost,
  ADR 0020) is blocked at the unpost step: reopen the month first.
- Migrations `20261113000000_accounting_periods` (table, enum values) and
  `20261113000100_accounting_period_permissions` (permission rows and
  system-role grants for databases seeded before) are additive and
  idempotent.
- Known gap, not changed here: some automatic postings (payments, inventory
  documents, transfers, service acts, the dispatch invoice, the sales-return
  cancel reversal) date their journal entry "now" rather than the document
  date. The explicit document-date checks above keep the closing rule
  intact; correcting the entry dates is a separate change.
- No UI yet: periods are closed through the API.
