type SupportedCurrency = 'USD' | 'UZS';

/** Convert a product's stored reference cost into the purchase document currency. */
export function convertCostPriceToDocumentCurrency(
  amount: number,
  costCurrency: string | null | undefined,
  costPriceExchangeRate: number,
  documentCurrency: string,
  documentExchangeRate: number,
): number | null {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !isSupportedCurrency(costCurrency) ||
    !isSupportedCurrency(documentCurrency)
  ) {
    return null;
  }

  if (costCurrency === documentCurrency) return roundMoney(amount);
  if (costCurrency === 'USD' && (!Number.isFinite(costPriceExchangeRate) || costPriceExchangeRate <= 0)) {
    return null;
  }
  if (documentCurrency === 'USD' && (!Number.isFinite(documentExchangeRate) || documentExchangeRate <= 0)) {
    return null;
  }

  const costInUzs = costCurrency === 'UZS' ? amount : amount * costPriceExchangeRate;
  return roundMoney(documentCurrency === 'UZS' ? costInUzs : costInUzs / documentExchangeRate);
}

function isSupportedCurrency(currency: string | null | undefined): currency is SupportedCurrency {
  return currency === 'USD' || currency === 'UZS';
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
