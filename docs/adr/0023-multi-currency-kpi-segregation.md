# 23. Multi-Currency KPI Segregation

## Context
In multi-currency business environments where transactions occur in UZS, USD, EUR, etc., summing operational amounts across disparate currencies or forcing foreign currencies into a single hardcoded currency unit (e.g. `currency: 'UZS'`) creates severely distorted executive reporting (e.g. $10,000 in sales being added to 100,000,000 UZS as "100,010,000 UZS").
Furthermore, displaying a foreign currency document total as UZS in dashboard KPI cards causes confusion and breaches accounting fidelity.

## Decision
1. **No Cross-Currency Flattening**: Summary KPI statistics (in Purchases `/purchases/summary`, Sales `/sales/summary`, Dashboard, and Finance) must never sum across distinct currencies without explicit conversion, nor arbitrarily hardcode a single currency code.
2. **Multi-Currency Segregated Totals**:
   - Backend summary endpoints must group amounts by their native currency, returning per-currency totals (e.g. `{ totalsByCurrency: { UZS: 25000000, USD: 1250 } }`).
   - Summary KPI cards must display distinct amounts for each currency active in the period (e.g., `25 000 000 UZS` and `$1 250` stacked or tabularly).
   - If a company or period has transactions in only one currency, only that currency is displayed.
3. **Debt Segregation by Currency**:
   - Customer and supplier debts must be computed according to the currency of the unpaid documents or transactions, reporting segregated balances (e.g. `8 400 000 UZS` and `$450`).
4. **Document Table Preservation**:
   - Document tables continue displaying each line item and document in its explicitly entered native currency.
