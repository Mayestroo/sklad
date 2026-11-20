/**
 * ADR 0023: totals over documents are kept per currency, never added across
 * currencies. A row without a currency is data corruption and fails loudly
 * (ADR 0022) instead of being counted in a guessed currency.
 */
export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export function totalsByCurrency<T>(
  rows: readonly T[],
  currencyOf: (row: T) => string | null | undefined,
  amountOf: (row: T) => number | string | null | undefined,
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = currencyOf(row);
    if (typeof currency !== 'string' || currency.trim() === '') {
      throw new TypeError('totalsByCurrency: a row has no currency');
    }
    const amount = Number(amountOf(row) ?? 0);
    if (!Number.isFinite(amount)) {
      throw new TypeError(`totalsByCurrency: invalid amount for ${currency}`);
    }
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}
