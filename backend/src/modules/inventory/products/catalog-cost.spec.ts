import { catalogCostFromUzs } from './catalog-cost';

describe('catalogCostFromUzs (ADR 0007: the card keeps its currency)', () => {
  it('a USD receipt writes the cost in USD at the receipt rate', () => {
    expect(
      catalogCostFromUzs(
        6_069_000,
        { costPriceCurrency: 'UZS' },
        { currency: 'USD', exchangeRate: 11_900 },
      ),
    ).toEqual({
      costPrice: 510,
      costPriceCurrency: 'USD',
      costPriceExchangeRate: 11_900,
    });
  });

  it('an additional expense keeps a USD card in USD at its rate; UZS value is unchanged', () => {
    // 510 USD × 11,900 + 238,000 UZS of transport = 6,307,000 UZS → 530 USD
    const update = catalogCostFromUzs(6_307_000, {
      costPriceCurrency: 'USD',
      costPriceExchangeRate: 11_900,
    });
    expect(update).toEqual({
      costPrice: 530,
      costPriceCurrency: 'USD',
      costPriceExchangeRate: 11_900,
    });
    expect(update.costPrice * update.costPriceExchangeRate).toBe(6_307_000);
  });

  it('a UZS card, or a USD card without a rate, is written in UZS (no guessed rate)', () => {
    expect(
      catalogCostFromUzs(12_345.678, {
        costPriceCurrency: 'UZS',
        costPriceExchangeRate: 1,
      }),
    ).toEqual({
      costPrice: 12_345.68,
      costPriceCurrency: 'UZS',
      costPriceExchangeRate: 1,
    });
    expect(
      catalogCostFromUzs(100, {
        costPriceCurrency: 'USD',
        costPriceExchangeRate: 0,
      }).costPriceCurrency,
    ).toBe('UZS');
    expect(catalogCostFromUzs(100, null).costPriceCurrency).toBe('UZS');
  });

  it('a UZS receipt follows the card currency', () => {
    expect(
      catalogCostFromUzs(
        125_000,
        { costPriceCurrency: 'USD', costPriceExchangeRate: 12_500 },
        { currency: 'UZS', exchangeRate: 1 },
      ),
    ).toEqual({
      costPrice: 10,
      costPriceCurrency: 'USD',
      costPriceExchangeRate: 12_500,
    });
  });
});
