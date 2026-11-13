/**
 * Opening-balance inventory line helpers (muammolar.pdf B2).
 *
 * A product picked on an inventory line brings the cost from its card, in the
 * card's currency, unless the user already typed a cost. A foreign-currency
 * rate is never guessed (ADR 0022): it is left empty for the user to enter.
 */
export interface InventoryLineDraft {
  quantity?: number | null;
  unitCost?: number | null;
  amount?: number;
  currency?: string;
  exchangeRate?: number | string;
}

export interface ProductCostCard {
  costPrice: number | string;
  costPriceCurrency: string | null;
}

export function withProductCost<T extends InventoryLineDraft>(line: T, product: ProductCostCard | undefined): T & InventoryLineDraft {
  if (Number(line.unitCost) > 0) return line;
  if (!product || !(Number(product.costPrice) > 0) || !product.costPriceCurrency) return line;
  const unitCost = Number(product.costPrice);
  return {
    ...line,
    unitCost,
    currency: product.costPriceCurrency,
    exchangeRate: product.costPriceCurrency === 'UZS' ? 1 : '',
    amount: Math.round(Number(line.quantity || 0) * unitCost * 100) / 100,
  };
}
