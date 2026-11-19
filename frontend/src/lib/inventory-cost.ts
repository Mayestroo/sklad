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

/**
 * The unit price a purchase line starts with when a product is picked: the
 * product's reference cost in the document currency, or 0 (left for the user)
 * when the document or cost currency is not chosen yet or a needed rate is
 * missing. F8 / ADR 0022: never priced in a guessed currency.
 */
export function documentUnitPriceFromProductCost(
  product: {
    costPrice?: number | string | null;
    costPriceCurrency?: string | null;
    costPriceExchangeRate?: number | string | null;
  },
  documentCurrency: string | null | undefined,
  documentExchangeRate: number,
): number {
  if (!documentCurrency) return 0;
  return convertCostPriceToDocumentCurrency(
    Number(product.costPrice) || 0,
    product.costPriceCurrency,
    Number(product.costPriceExchangeRate),
    documentCurrency,
    documentExchangeRate,
  ) ?? 0;
}

/**
 * Markup of the sale price over the card cost, in percent, or null when the
 * two cannot be compared: no cost, no sale price currency, or a USD sale
 * price against a UZS cost (no rate on the card to convert with). A UZS sale
 * price against a USD cost uses the cost's own rate.
 */
export function catalogMarkupPercent(product: {
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
  salePrice?: number | string | null;
  salePriceCurrency?: string | null;
}): number | null {
  const sale = Number(product.salePrice);
  if (!Number.isFinite(sale) || !isSupportedCurrency(product.salePriceCurrency)) return null;
  const cost = convertCostPriceToDocumentCurrency(
    Number(product.costPrice),
    product.costPriceCurrency,
    Number(product.costPriceExchangeRate),
    product.salePriceCurrency,
    product.salePriceCurrency === 'USD' ? Number(product.costPriceExchangeRate) : 1,
  );
  if (cost === null || cost <= 0) return null;
  if (product.salePriceCurrency === 'USD' && product.costPriceCurrency !== 'USD') return null;
  return Math.round(((sale - cost) / cost) * 10000) / 100;
}
