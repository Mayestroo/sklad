/**
 * ADR 0007: the product card's cost price follows the latest landed cost.
 *
 * The landed cost is kept in UZS on batches. The card used to be rewritten
 * as UZS every time, so a product priced in USD (cost and sale price in USD)
 * ended up with a UZS cost next to a USD sale price: the margin could no
 * longer be compared and sales showed a cost in another currency.
 *
 * Now the card keeps its currency: a USD card gets the cost in USD at the
 * rate that turns it back into the same UZS amount (the receipt's rate when
 * the cost comes from a USD receipt, else the card's own rate). A card with
 * no usable USD rate is written in UZS, as before — a rate is never guessed.
 */
export interface CatalogCostCard {
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | { toString(): string } | null;
}

export interface CatalogCostUpdate {
  costPrice: number;
  costPriceCurrency: 'UZS' | 'USD';
  costPriceExchangeRate: number;
}

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function catalogCostFromUzs(
  landedCostUzs: number,
  card: CatalogCostCard | null | undefined,
  source?: { currency: string; exchangeRate: number } | null,
): CatalogCostUpdate {
  const uzs = round2(landedCostUzs);
  const sourceRate = Number(source?.exchangeRate);
  if (
    source?.currency === 'USD' &&
    Number.isFinite(sourceRate) &&
    sourceRate > 0
  ) {
    return {
      costPrice: round2(uzs / sourceRate),
      costPriceCurrency: 'USD',
      costPriceExchangeRate: sourceRate,
    };
  }
  const cardRate = Number(card?.costPriceExchangeRate);
  if (
    card?.costPriceCurrency === 'USD' &&
    Number.isFinite(cardRate) &&
    cardRate > 0
  ) {
    return {
      costPrice: round2(uzs / cardRate),
      costPriceCurrency: 'USD',
      costPriceExchangeRate: cardRate,
    };
  }
  return { costPrice: uzs, costPriceCurrency: 'UZS', costPriceExchangeRate: 1 };
}
